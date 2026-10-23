/**
 * @file .ai/tools/git-delivery/src/worker/verification/bindGitVerificationCommit.service.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Связывает exact OID только с attestation снимка подтверждённой операции commit.
 */
import { PolicyError } from "@realize/git-runtime";
import type { Context } from "../../GitDelivery.types.ts";
import {
  hashVerificationRecipe,
  type VerificationPlan,
} from "@realize/verification-runtime";
import type { GitWorkerReport } from "../GitWorker.types.ts";
import { GitVerificationCommitProofRepository } from "./GitVerificationCommitProof.repository.ts";

/** Prepared proof переживает обрыв; verified noop/recovery может завершить привязку исходного fingerprint. */
export async function bindGitVerificationCommit(
  context: Context,
  plan: VerificationPlan,
  report: GitWorkerReport,
): Promise<void> {
  // Внешнее состояние never-check нельзя переносить в последующий push даже при неизменном OID.
  if (plan.checks.some((check) => check.reuse === "never")) return;
  const result = report.result;
  if (
    report.status !== "succeeded" ||
    report.command?.action !== "commit" ||
    !result ||
    !["succeeded", "noop"].includes(result.status) ||
    result.action !== "commit" ||
    result.commitCreated !== true ||
    result.requestId !== context.requestId ||
    !result.commit ||
    !result.fingerprint
  )
    return;
  const repository = new GitVerificationCommitProofRepository(context);
  const proof = await repository.readPrepared(result.fingerprint);
  if (
    !proof ||
    proof.checks.length !== plan.checks.length ||
    plan.checks.some(
      (check) =>
        proof.checks.find((entry) => entry.id === check.id)?.recipeKey !==
        hashVerificationRecipe(check),
    )
  )
    throw new PolicyError(
      "verification_commit_proof_missing",
      "Подтверждённый commit не имеет attestation исходного проверенного снимка.",
    );
  await repository.saveCommit(result.commit, proof);
}
