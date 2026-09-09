/**
 * @file .ai/tools/git-delivery/src/push/validateGitPushJournal.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет привязку и допустимый этап сохранённого журнала push без файловых операций.
 */

import { PolicyError } from "../contracts.ts";
import type { GitPushJournal } from "./GitPush.types.ts";

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
        !["version", "kind", "binding", "target", "commits", "phase"].includes(
          key,
        ),
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
  return journal;
}
