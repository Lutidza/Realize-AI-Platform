/**
 * @file .ai/tools/git-delivery/src/parseGitCommitRecovery.validator.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет явно разрешённую попытку восстановления commit и прежний отпечаток.
 */

import { MAX_GIT_COMMIT_RECOVERY_ATTEMPTS } from "./commit/gitCommitRecovery.constants.ts";
import type { Context } from "./GitDelivery.types.ts";
import { PolicyError } from "@realize/git-runtime";

/** Проверяет форму разрешения; связь с прежним журналом устанавливает операция commit. */
export function parseGitCommitRecovery(
  value: unknown,
): NonNullable<Context["recovery"]> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => key !== "attempt" && key !== "previousFingerprint",
    )
  ) {
    throw new PolicyError(
      "commit_recovery_invalid",
      "Некорректный формат разрешения восстановления commit.",
    );
  }
  const source = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(source.attempt) ||
    Number(source.attempt) < 1 ||
    Number(source.attempt) > MAX_GIT_COMMIT_RECOVERY_ATTEMPTS ||
    typeof source.previousFingerprint !== "string" ||
    source.previousFingerprint.length !== 64 ||
    !/^[a-f0-9]{64}$/.test(source.previousFingerprint)
  ) {
    throw new PolicyError(
      "commit_recovery_invalid",
      "Нужны допустимый номер попытки и прежний отпечаток снимка.",
    );
  }
  return {
    attempt: Number(source.attempt),
    previousFingerprint: source.previousFingerprint,
  };
}
