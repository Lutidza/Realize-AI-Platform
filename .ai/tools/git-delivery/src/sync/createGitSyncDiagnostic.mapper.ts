/**
 * @file .ai/tools/git-delivery/src/sync/createGitSyncDiagnostic.mapper.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Преобразует сбой синхронизации в ограниченную диагностику без сообщений и stderr.
 */

import { GitFailure } from "@realize/git-runtime";
import { GIT_FAILURE_CATEGORIES } from "@realize/git-runtime";
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
