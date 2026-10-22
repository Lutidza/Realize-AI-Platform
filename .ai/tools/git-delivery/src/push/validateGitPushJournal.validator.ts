/**
 * @file .ai/tools/git-delivery/src/push/validateGitPushJournal.validator.ts
 * @version 1.1.1
 * @date 2026-10-22
 * @description Проверяет привязку и допустимый этап сохранённого журнала push без файловых операций.
 */
import { PolicyError } from "@realize/git-runtime";

import type { GitPushJournal } from "./GitPush.types.ts";
import { MAX_GIT_PUSH_RECOVERY_ATTEMPTS } from "./gitPush.constants.ts";
import { validateGitPushDiagnostic } from "./validateGitPushDiagnostic.validator.ts";

/**
 * Возвращает журнал только для того же разрешения; занятый requestId не разрешает другую отправку.
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
export function validateGitPushJournal(
  value: unknown,
  expected: GitPushJournal,
): GitPushJournal {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PolicyError("invalid_journal", "Некорректный журнал push.");
  }
  const journal = value as GitPushJournal;
  if (
    Object.keys(journal).some(
      (key) =>
        ![
          "version",
          "kind",
          "binding",
          "target",
          "commits",
          "phase",
          "diagnostic",
          "recoveryAttempts",
        ].includes(key),
    ) ||
    journal.version !== 1 ||
    journal.kind !== "push" ||
    journal.binding !== expected.binding ||
    JSON.stringify(journal.target) !== JSON.stringify(expected.target) ||
    JSON.stringify(journal.commits) !== JSON.stringify(expected.commits)
  ) {
    throw new PolicyError(
      "request_conflict",
      "requestId уже связан с другим действием или назначением.",
    );
  }
  if (
    !["prepared", "sending", "succeeded", "unknown"].includes(journal.phase)
  ) {
    throw new PolicyError("invalid_journal", "Неизвестный этап журнала push.");
  }
  if (
    journal.recoveryAttempts !== undefined &&
    (!Number.isSafeInteger(journal.recoveryAttempts) ||
      journal.recoveryAttempts < 0 ||
      journal.recoveryAttempts > MAX_GIT_PUSH_RECOVERY_ATTEMPTS)
  ) {
    throw new PolicyError(
      "invalid_journal",
      "Некорректный счётчик повторов push.",
    );
  }
  return {
    ...journal,
    ...(journal.diagnostic === undefined
      ? {}
      : { diagnostic: validateGitPushDiagnostic(journal.diagnostic) }),
  };
}
