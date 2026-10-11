/**
 * @file .ai/tools/git-delivery/src/commit/acceptGitCommitRecovery.service.ts
 * @version 1.1.0
 * @date 2026-10-11
 * @description Принимает проверенное исправление прерванного commit с сохранением его назначения.
 */
import { PolicyError } from "../Policy.error.ts";
import type { Context, Result } from "../GitDelivery.types.ts";
import type { Git } from "../Git.adapter.ts";
import type { Snapshot } from "../GitSnapshot.types.ts";
import type { Journal } from "./GitCommitJournal.types.ts";
import { saveJournal } from "../state.ts";
import { resolveGitCommitSnapshot } from "./resolveGitCommitSnapshot.util.ts";
import { validateChanges } from "./validateGitChanges.validator.ts";
import { verifyGitStagedContent } from "./verifyGitStagedContent.adapter.ts";
import { verifyEvidence } from "./verifyGitCommitEvidence.validator.ts";
import { MAX_GIT_COMMIT_RECOVERY_ATTEMPTS } from "./gitCommitRecovery.constants.ts";

/** Поколение сохраняется до add; проверка владения старым индексом не разрешает его commit. */
export async function acceptGitCommitRecovery(
  git: Git,
  context: Context,
  journal: Journal,
  snapshot: Snapshot,
  result: Result,
): Promise<Journal> {
  const recovery = context.recovery;
  const scope = context.authorization.scope;
  const includePartialIndex =
    scope.mode === "all" && scope.includePartialIndex === true;
  const previous = resolveGitCommitSnapshot(journal);
  const counter = journal.recovery?.attempt ?? 0;
  result.recoveryAttempts = counter;
  if (!recovery) {
    if (counter)
      throw new PolicyError(
        "commit_recovery_required",
        "Для продолжения нужен контекст принятого восстановления commit.",
      );
    return journal;
  }
  if (recovery.attempt === counter) {
    if (
      recovery.previousFingerprint !== journal.recovery?.previousFingerprint
    ) {
      throw new PolicyError(
        "commit_recovery_conflict",
        "Номер восстановления связан с другим предыдущим снимком.",
      );
    }
    return journal;
  }
  if (
    recovery.attempt !== counter + 1 ||
    recovery.attempt > MAX_GIT_COMMIT_RECOVERY_ATTEMPTS ||
    recovery.previousFingerprint !== previous.fingerprint
  ) {
    throw new PolicyError(
      "commit_recovery_conflict",
      "Нужен следующий номер восстановления и отпечаток последнего принятого снимка.",
    );
  }
  if (journal.preparedTree || journal.commit || journal.noop) {
    throw new PolicyError(
      "commit_recovery_unavailable",
      "Обновление снимка допустимо только до подготовки дерева commit.",
    );
  }
  for (const key of [
    "root",
    "gitDir",
    "commonDir",
    "head",
    "branch",
  ] as const) {
    if (snapshot[key] !== previous[key]) {
      throw new PolicyError(
        "repository_changed",
        "Восстановление не меняет ветку, HEAD или рабочую копию.",
      );
    }
  }
  verifyEvidence(context, snapshot.fingerprint, result);
  const previousPaths = previous.changes.map((change) => change.path);
  if (snapshot.indexHash !== previous.indexHash) {
    try {
      // Старый индекс может содержать отвергнутые bytes, но должен целиком принадлежать операции.
      await verifyGitStagedContent(
        git,
        previous,
        previousPaths,
        undefined,
        includePartialIndex,
      );
    } catch {
      throw new PolicyError(
        "index_changed",
        "Подготовленный индекс не совпадает с предыдущим снимком операции.",
      );
    }
  }
  const paths = validateChanges(
    snapshot,
    new Set(previousPaths),
    includePartialIndex,
  );
  if (!paths.length) {
    throw new PolicyError(
      "commit_recovery_unavailable",
      "Исправленный снимок не содержит изменений для commit.",
    );
  }
  const accepted: Journal = {
    ...journal,
    recovery: {
      attempt: recovery.attempt,
      previousFingerprint: previous.fingerprint,
      snapshot,
    },
  };
  delete accepted.result;
  await saveJournal(context, accepted);
  result.recoveryAttempts = recovery.attempt;
  return accepted;
}
