/**
 * @file packages/verification-runtime/src/verifyVerification.service.ts
 * @version 1.2.0
 * @date 2026-10-23
 * @description Проверяет latest receipts по текущим inputs; не запускает команды и не создаёт файлы или lock.
 */
import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { PolicyError } from "@realize/git-runtime";
import type {
  VerificationOptions,
  VerificationPlan,
  VerificationReport,
  VerificationResult,
} from "./Verification.types.ts";
import { validateVerificationPlan } from "./validateVerificationPlan.validator.ts";
import { isVerificationInputPath } from "./validateVerificationPlan.validator.ts";
import { hashVerificationRecipe } from "./hashVerificationRecipe.util.ts";
import {
  readVerificationSharedCheckpoint,
  readVerificationCheckpoint,
} from "./readVerificationCheckpoint.adapter.ts";
import {
  verificationReceiptRepository,
  readVerificationReceipt,
} from "./VerificationReceipt.repository.ts";

export function verificationReport(
  plan: VerificationPlan,
  checks: VerificationResult[],
): VerificationReport {
  return {
    version: 1,
    projectId: plan.projectId,
    taskId: plan.taskId,
    success: checks.every((check) => check.status === "passed"),
    checks,
  };
}
export function verificationReason(error: unknown): string {
  return error instanceof PolicyError ? error.code : "verification_unavailable";
}
export function verificationDiagnostic(error: unknown): string | undefined {
  // Только эти ошибки содержат проверенные номера версий или фиксированный текст, без путей/credentials.
  return error instanceof PolicyError &&
    [
      "verification_runtime_manifest_invalid",
      "verification_node_version_mismatch",
      "verification_npm_version_mismatch",
    ].includes(error.code)
    ? error.message
    : undefined;
}
export async function assertVerificationRoot(
  plan: VerificationPlan,
  options: VerificationOptions,
): Promise<void> {
  if (options.signal?.aborted)
    throw new PolicyError("verification_cancelled", "Проверка отменена.");
  if (
    process.platform !== "linux" ||
    (await realpath(plan.repositoryRoot)) !== plan.repositoryRoot ||
    !options.storage ||
    typeof options.storage.root !== "string" ||
    !isAbsolute(options.storage.root) ||
    resolve(options.storage.root) !== options.storage.root ||
    (await realpath(options.storage.root)) !== options.storage.root ||
    typeof options.storage.directory !== "string" ||
    !options.storage.directory ||
    /[\0\r\n\\]/u.test(options.storage.directory) ||
    options.storage.directory.length > 1024 ||
    options.storage.directory
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part === ".git" ||
          part === "node_modules",
      ) ||
    (options.portability !== undefined &&
      !["workspace", "content"].includes(options.portability)) ||
    (options.additionalInputs !== undefined &&
      (!Array.isArray(options.additionalInputs) ||
        options.additionalInputs.length > 128 ||
        !options.additionalInputs.every(isVerificationInputPath)))
  )
    throw new PolicyError(
      "verification_root_invalid",
      "Проверка требует канонический Linux workspace.",
    );
  if (options.portability === "content" && !options.dependencyLease)
    throw new PolicyError(
      "verification_dependency_lease_invalid",
      "Перенос результатов требует capability materializer.",
    );
}

export async function verifyVerification(
  input: unknown,
  options: VerificationOptions,
): Promise<VerificationReport> {
  const plan = validateVerificationPlan(input);
  await assertVerificationRoot(plan, options);
  let shared: string;
  try {
    shared = await readVerificationSharedCheckpoint(
      plan.repositoryRoot,
      options,
    );
  } catch (error) {
    return verificationReport(
      plan,
      plan.checks.map((check) => ({
        id: check.id,
        recipeKey: hashVerificationRecipe(check),
        status: "blocked",
        executed: false,
        reused: false,
        key: null,
        receiptId: null,
        reason: verificationReason(error),
        diagnostic: verificationDiagnostic(error),
      })),
    );
  }
  const results: VerificationResult[] = [];
  for (const check of plan.checks) {
    const base = {
      id: check.id,
      executed: false,
      reused: false,
      recipeKey: hashVerificationRecipe(check),
      key: null,
      receiptId: null,
      logPath: verificationReceiptRepository(plan, check, options).relativePath,
    };
    try {
      if (options.signal?.aborted)
        throw new PolicyError("verification_cancelled", "Проверка отменена.");
      const current = await readVerificationCheckpoint(
        plan.repositoryRoot,
        check,
        shared,
        options,
      );
      const receipt = await readVerificationReceipt(plan, check, options);
      const status = !receipt
        ? "missing"
        : receipt.status !== "passed"
          ? receipt.status
          : receipt.key !== current.digest ||
              receipt.recipeKey !== base.recipeKey
            ? "stale"
            : "passed";
      results.push({
        ...base,
        status,
        key: current.digest,
        receiptId: receipt?.receiptId ?? null,
        reused: status === "passed" && check.reuse === "local",
        ...(receipt?.result?.reason ? { reason: receipt.result.reason } : {}),
        ...(receipt?.result && receipt.finishedAt
          ? {
              evidence: {
                startedAt: receipt.startedAt,
                finishedAt: receipt.finishedAt,
                durationMs: Math.max(
                  0,
                  Date.parse(receipt.finishedAt) -
                    Date.parse(receipt.startedAt),
                ),
                result: receipt.result,
              },
            }
          : {}),
      });
    } catch (error) {
      results.push({
        ...base,
        status: "blocked",
        reason: verificationReason(error),
        diagnostic: verificationDiagnostic(error),
      });
    }
  }
  return verificationReport(plan, results);
}
