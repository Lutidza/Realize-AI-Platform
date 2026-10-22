/**
 * @file .ai/tools/git-delivery/src/push/validateGitPushDiagnostic.validator.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет сохранённую диагностику перед передачей из журнала в результат push.
 */
import { PolicyError } from "@realize/git-runtime";

import { GIT_FAILURE_CATEGORIES } from "@realize/git-runtime";
import { GIT_PUSH_STAGES } from "./gitPush.constants.ts";
import type { GitPushDiagnostic } from "./GitPush.types.ts";

export function validateGitPushDiagnostic(value: unknown): GitPushDiagnostic {
  const entry = value as GitPushDiagnostic;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    Object.keys(value).some(
      (key) => !["stage", "category", "exitCode"].includes(key),
    ) ||
    !GIT_PUSH_STAGES.includes(entry.stage) ||
    !GIT_FAILURE_CATEGORIES.includes(entry.category) ||
    (entry.exitCode !== null &&
      (!Number.isInteger(entry.exitCode) ||
        entry.exitCode < 0 ||
        entry.exitCode > 255))
  ) {
    throw new PolicyError("invalid_journal", "Некорректная диагностика push.");
  }
  return {
    stage: entry.stage,
    category: entry.category,
    exitCode: entry.exitCode,
  };
}
