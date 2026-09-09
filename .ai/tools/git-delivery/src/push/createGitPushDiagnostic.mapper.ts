/**
 * @file .ai/tools/git-delivery/src/push/createGitPushDiagnostic.mapper.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Преобразует ошибку исполнения в безопасную диагностику push без исходного сообщения.
 */

import { GitFailure } from "../GitFailure.error.ts";
import { GIT_FAILURE_CATEGORIES } from "../gitFailureCategory.constants.ts";
import type { GitPushDiagnostic, GitPushStage } from "./GitPush.types.ts";

export function createGitPushDiagnostic(
  error: unknown,
  stage: GitPushStage,
): GitPushDiagnostic {
  const failure = error instanceof GitFailure ? error : undefined;
  return {
    stage,
    category:
      failure && GIT_FAILURE_CATEGORIES.includes(failure.category)
        ? failure.category
        : "unknown",
    exitCode:
      failure &&
      Number.isInteger(failure.exitCode) &&
      failure.exitCode !== null &&
      failure.exitCode >= 0 &&
      failure.exitCode <= 255
        ? failure.exitCode
        : null,
  };
}
