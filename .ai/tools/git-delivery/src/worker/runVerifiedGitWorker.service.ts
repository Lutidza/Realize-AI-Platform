/**
 * @file .ai/tools/git-delivery/src/worker/runVerifiedGitWorker.service.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Собирает evidence explicit verification plan перед штатным Git-воркером и сохраняет подтверждённый commit proof.
 */
import { PolicyError } from "@realize/git-runtime";
import { loadGitWorkerContext } from "./loadGitWorkerContext.adapter.ts";
import { loadGitWorkerSettings } from "./loadGitWorkerSettings.adapter.ts";
import { runGitWorker } from "./runGitWorker.service.ts";
import type {
  GitWorkerCommand,
  GitWorkerDependencies,
  GitWorkerReport,
} from "./GitWorker.types.ts";
import { prepareGitWorkerVerification } from "./verification/prepareGitWorkerVerification.service.ts";
import { GitVerificationCommitProofRepository } from "./verification/GitVerificationCommitProof.repository.ts";
import { bindGitVerificationCommit } from "./verification/bindGitVerificationCommit.service.ts";
import type {
  GitWorkerVerificationDependencies,
  GitWorkerVerificationPreparation,
} from "./verification/GitWorkerVerification.types.ts";

/** Модель не получает plan/receipts; выполняются те же settings, capabilities и Git handlers. */
export async function runVerifiedGitWorker(
  command: GitWorkerCommand,
  repositoryRoot: string,
  contextPath: string | undefined,
  planPath: string,
  workerDependencies: GitWorkerDependencies,
  signal?: AbortSignal,
  dependencies: GitWorkerVerificationDependencies = {},
): Promise<GitWorkerReport> {
  if (command.action !== "commit" && command.action !== "push")
    throw new PolicyError(
      "worker_scope_invalid",
      "Verification integration допускает только commit/push.",
    );
  const run = dependencies.runWorker ?? runGitWorker;
  const settings = dependencies.loadSettings ?? loadGitWorkerSettings;
  let prepared: GitWorkerVerificationPreparation | undefined;
  const context = await loadGitWorkerContext(
    command.action,
    repositoryRoot,
    contextPath,
    {
      resolveCommitAuthor: dependencies.resolveCommitAuthor,
      async prepareVerification(input) {
        prepared = await prepareGitWorkerVerification({
          context: input,
          planPath,
          signal,
          dependencies,
          inspect: async (inspection) =>
            run(
              { action: "inspect" },
              inspection,
              await settings(repositoryRoot, "inspect"),
              workerDependencies,
              signal,
            ),
        });
        return prepared.context;
      },
    },
  );
  if (!prepared)
    throw new PolicyError(
      "checks_stale_or_missing",
      "Verification preparation отсутствует.",
    );
  if (
    command.action === "commit" &&
    !("target" in context) &&
    !("operation" in context) &&
    prepared.fingerprint &&
    prepared.checks
  )
    await new GitVerificationCommitProofRepository(context).savePrepared(
      prepared.fingerprint,
      prepared.checks,
    );
  signal?.throwIfAborted();
  const report = await run(
    command,
    context,
    await settings(repositoryRoot, command.action),
    workerDependencies,
    signal,
  );
  if (
    command.action === "commit" &&
    !("target" in context) &&
    !("operation" in context)
  ) {
    try {
      await bindGitVerificationCommit(context, prepared.plan, report);
    } catch (error) {
      // Сохранение proof не скрывает уже подтверждённый Git result и не делает повторный commit.
      report.status = "blocked";
      report.errorCode =
        error instanceof PolicyError
          ? error.code
          : "verification_proof_save_failed";
    }
  }
  return report;
}
