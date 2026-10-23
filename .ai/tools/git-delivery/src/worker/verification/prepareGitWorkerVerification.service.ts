/**
 * @file .ai/tools/git-delivery/src/worker/verification/prepareGitWorkerVerification.service.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Связывает требуемые checks с текущим worker snapshot либо подтверждёнными OID без назначения полномочий.
 */
import { PolicyError } from "@realize/git-runtime";
import { realpath } from "node:fs/promises";
import type { Context } from "../../GitDelivery.types.ts";
import { loadGitContext } from "../../loadGitContext.adapter.ts";
import {
  type VerificationPlan,
  type VerificationReport,
  hashVerificationRecipe,
  runVerification,
  verifyVerification,
  validateVerificationPlan,
  enumerateVerificationInputs,
} from "@realize/verification-runtime";
import { GitVerificationCommitProofRepository } from "./GitVerificationCommitProof.repository.ts";
import { gitVerificationOptions } from "./gitVerificationOptions.config.ts";
import type {
  GitVerifiedCheck,
  GitWorkerVerificationInput,
  GitWorkerVerificationPreparation,
} from "./GitWorkerVerification.types.ts";

function passed(
  report: VerificationReport,
  plan: VerificationPlan,
): GitVerifiedCheck[] {
  if (
    !report.success ||
    report.projectId !== plan.projectId ||
    report.taskId !== plan.taskId ||
    report.checks.length !== plan.checks.length
  )
    throw new PolicyError(
      "checks_stale_or_missing",
      "Verification receipts не подтверждают все обязательные проверки.",
    );
  return plan.checks.map((check) => {
    const results = report.checks.filter((result) => result.id === check.id);
    const result = results[0];
    if (
      results.length !== 1 ||
      result.status !== "passed" ||
      !result.key ||
      !/^[a-f0-9]{64}$/.test(result.key) ||
      !result.receiptId ||
      result.recipeKey !== hashVerificationRecipe(check)
    )
      throw new PolicyError(
        "checks_stale_or_missing",
        "Verification receipt не соответствует назначенному recipe.",
      );
    return {
      id: check.id,
      key: result.key,
      recipeKey: result.recipeKey,
      receiptId: result.receiptId,
    };
  });
}

/** Inspect проходит через configured worker; context чтения сохраняет только назначенные paths и snapshot inputs. */
function inspectContext(context: Context): Context {
  return {
    version: 1,
    requestId: context.requestId,
    projectId: context.projectId,
    taskId: context.taskId,
    repositoryRoot: context.repositoryRoot,
    authorization: { actions: ["inspect"], scope: context.authorization.scope },
    verification: {
      inputPaths: context.verification!.inputPaths,
      requiredChecks: [],
      results: [],
    },
  };
}

async function snapshot(
  input: GitWorkerVerificationInput,
  context: Context,
): Promise<string> {
  input.signal?.throwIfAborted();
  const report = await input.inspect(inspectContext(context));
  const result = report.result;
  if (
    report.status !== "succeeded" ||
    report.command?.action !== "inspect" ||
    !result ||
    result.status !== "succeeded" ||
    result.action !== "inspect" ||
    result.requestId !== context.requestId ||
    !result.fingerprint ||
    !/^[a-f0-9]{64}$/.test(result.fingerprint)
  )
    throw new PolicyError(
      "verification_inspect_failed",
      "Git-воркер не подтвердил снимок для verification evidence.",
    );
  return result.fingerprint;
}

export async function prepareGitWorkerVerification(
  input: GitWorkerVerificationInput,
): Promise<GitWorkerVerificationPreparation> {
  let context = input.context;
  const parsed = validateVerificationPlan(await loadGitContext(input.planPath));
  if (
    (await realpath(parsed.repositoryRoot)) !== context.repositoryRoot ||
    parsed.projectId !== context.projectId ||
    parsed.taskId !== context.taskId
  )
    throw new PolicyError(
      "verification_plan_mismatch",
      "Verification plan относится к другому проекту, задаче или рабочей копии.",
    );
  const required = context.verification!.requiredChecks;
  const plan: VerificationPlan = {
    ...parsed,
    repositoryRoot: context.repositoryRoot,
    checks: required.map((id) => {
      const check = parsed.checks.find((entry) => entry.id === id);
      if (!check)
        throw new PolicyError(
          "checks_required",
          "Verification plan не содержит назначенную проверку.",
        );
      return check;
    }),
  };
  input.signal?.throwIfAborted();
  if ("target" in context) {
    if (plan.checks.some((check) => check.reuse === "never"))
      throw new PolicyError(
        "verification_not_reusable",
        "Внешняя проверка reuse:never не переносится автоматически на push.",
      );
    const repository = new GitVerificationCommitProofRepository(context);
    const results = [];
    for (const commit of context.authorization.scope.commits) {
      const proof = await repository.readCommit(commit);
      for (const check of plan.checks) {
        const evidence = proof?.checks.find((entry) => entry.id === check.id);
        if (!evidence || evidence.recipeKey !== hashVerificationRecipe(check))
          throw new PolicyError(
            "verification_commit_proof_missing",
            "Для разрешённого commit отсутствует совпадающее verification evidence.",
          );
        results.push({ id: check.id, commit, status: "passed" as const });
      }
    }
    return {
      plan,
      context: {
        ...context,
        verification: { ...context.verification, results },
      },
    };
  }
  const enumerate =
    input.dependencies?.enumerateInputs ?? enumerateVerificationInputs;
  const options = gitVerificationOptions(plan, input.signal);
  const declaredInputs = context.verification!.inputPaths;
  const enumeratePaths = async () =>
    [
      ...new Set([...declaredInputs, ...(await enumerate(plan, options))]),
    ].sort();
  const inputPaths = await enumeratePaths();
  if (inputPaths.length > 2048)
    throw new PolicyError(
      "verification_input_limit",
      "Список файлов проверки превышает допустимый предел Git snapshot.",
    );
  context = {
    ...context,
    verification: { ...context.verification!, inputPaths },
  };
  const run = input.dependencies?.runVerification ?? runVerification;
  const verify = input.dependencies?.verifyVerification ?? verifyVerification;
  const executed = await run(plan, options);
  const initial = passed(executed, plan);
  if (
    plan.checks.some(
      (check) =>
        check.reuse === "never" &&
        !executed.checks.find((entry) => entry.id === check.id)?.executed,
    )
  )
    throw new PolicyError(
      "checks_stale_or_missing",
      "Проверка reuse:never должна завершиться в текущем запуске.",
    );
  const before = await snapshot(input, context);
  const checked = passed(await verify(plan, options), plan);
  if (JSON.stringify(initial) !== JSON.stringify(checked))
    throw new PolicyError(
      "checks_stale_or_missing",
      "Verification evidence изменилось после выполнения проверок.",
    );
  if (JSON.stringify(inputPaths) !== JSON.stringify(await enumeratePaths()))
    throw new PolicyError(
      "checks_stale_or_missing",
      "Состав файлов verification inputs изменился во время подготовки.",
    );
  const after = await snapshot(input, context);
  if (
    before !== after ||
    JSON.stringify(inputPaths) !== JSON.stringify(await enumeratePaths())
  )
    throw new PolicyError(
      "checks_stale_or_missing",
      "Git-снимок изменился во время привязки verification evidence.",
    );
  return {
    plan,
    fingerprint: after,
    checks: checked,
    context: {
      ...context,
      verification: {
        ...context.verification!,
        results: required.map((id) => ({
          id,
          status: "passed",
          fingerprint: after,
        })),
      },
    },
  };
}
