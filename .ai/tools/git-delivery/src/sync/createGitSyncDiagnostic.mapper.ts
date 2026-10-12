/**
 * @file .ai/tools/git-delivery/src/sync/createGitSyncDiagnostic.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Преобразует сбой синхронизации в ограниченную диагностику без сообщений и stderr.
 */

import { GitFailure } from "../GitFailure.error.ts";
import { GIT_FAILURE_CATEGORIES } from "../gitFailureCategory.constants.ts";
import type { GitSyncDiagnostic, GitSyncStage } from "./GitSync.types.ts";

export function createGitSyncDiagnostic(
  error: unknown,
  stage: GitSyncStage,
): GitSyncDiagnostic {
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
