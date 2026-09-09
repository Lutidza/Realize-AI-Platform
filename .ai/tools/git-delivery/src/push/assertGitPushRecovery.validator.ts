/**
 * @file .ai/tools/git-delivery/src/push/assertGitPushRecovery.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Разрешает только следующую явно назначенную попытку незавершённого push.
 */

import { PolicyError } from "../contracts.ts";
import type { GitPushJournal, GitPushRecovery } from "./GitPush.types.ts";

/** Вызывается после проверки исходного remoteOid; счётчик сохраняется перед отправкой. */
export function assertGitPushRecovery(
  journal: GitPushJournal,
  recovery: GitPushRecovery | undefined,
  hasStoredJournal: boolean,
): number {
  const attempts = journal.recoveryAttempts ?? 0;
  if (!recovery) {
    if (journal.phase !== "prepared") {
      throw new PolicyError(
        "push_outcome_unknown",
        "Предыдущая отправка требует сверки и отдельного разрешения на повтор.",
      );
    }
    return attempts;
  }
  if (!hasStoredJournal || !["sending", "unknown"].includes(journal.phase)) {
    throw new PolicyError(
      "push_recovery_unavailable",
      "Нет незавершённой отправки для восстановления.",
    );
  }
  if (recovery.attempt !== attempts + 1) {
    throw new PolicyError(
      "push_recovery_invalid",
      "Нужна следующая отдельно разрешённая попытка восстановления.",
    );
  }
  return recovery.attempt;
}
