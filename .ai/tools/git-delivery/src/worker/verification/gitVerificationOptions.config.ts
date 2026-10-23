/**
 * @file .ai/tools/git-delivery/src/worker/verification/gitVerificationOptions.config.ts
 * @version 1.0.1
 * @date 2026-10-23
 * @description Задаёт личное хранилище IDE receipts и обязательные исходники Git materializer для общего runner.
 */
import type {
  VerificationOptions,
  VerificationPlan,
} from "@realize/verification-runtime";

/** Только проверенный plan задаёт task/root; модель и receipt не выбирают storage или evidence policy. */
export function gitVerificationOptions(
  plan: VerificationPlan,
  signal?: AbortSignal,
): VerificationOptions {
  return {
    storage: {
      root: plan.repositoryRoot,
      directory: `.ai-workspace/tasks/${plan.taskId}/logs/git-verification`,
    },
    portability: "workspace",
    additionalInputs: [
      ".ai/tools/git-delivery/package.json",
      ".ai/tools/git-delivery/tsconfig.json",
      ".ai/tools/git-delivery/src/verification/runGitVerification.controller.ts",
      ".ai/tools/git-delivery/src/worker/verification",
      ".ai/tools/git-delivery/src/worker/runVerifiedGitWorker.service.ts",
      ".ai/tools/git-delivery/src/worker/runGitInspect.service.ts",
      ".ai/tools/git-delivery/src/worker/loadGitWorkerContext.adapter.ts",
      ".ai/tools/git-delivery/src/GitJournal.repository.ts",
      ".ai/tools/git-delivery/src/GitJournal.types.ts",
    ],
    signal,
  };
}
