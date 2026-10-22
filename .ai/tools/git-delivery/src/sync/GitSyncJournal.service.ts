/**
 * @file .ai/tools/git-delivery/src/sync/GitSyncJournal.service.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Привязывает журнал синхронизации к точному назначению и изолированному tracking ref.
 */

import { createHash } from "node:crypto";
import { GitJournalRepository } from "../GitJournal.repository.ts";
import { PolicyError } from "@realize/git-runtime";
import type {
  GitSyncAction,
  GitSyncContext,
  GitSyncJournal,
} from "./GitSync.types.ts";

/** Один service-owned ref на ветку ограничивает рост metadata при множестве requests. */
export function gitSyncTrackingRef(context: GitSyncContext): string {
  return `refs/remotes/realize-sync/${context.target.branch}`;
}

/** Журнал не хранит секретов; несовпадение binding запрещает переиспользовать requestId. */
export async function loadGitSyncJournal(
  action: GitSyncAction,
  context: GitSyncContext,
  repository: GitJournalRepository,
  previousOid: string | null,
): Promise<GitSyncJournal> {
  const expected: GitSyncJournal = {
    version: 1,
    kind: action,
    binding: createHash("sha256").update(JSON.stringify(context)).digest("hex"),
    trackingRef: gitSyncTrackingRef(context),
    previousOid,
    phase: "prepared",
  };
  const stored = await repository.load();
  if (stored === null) return expected;
  if (
    !stored ||
    typeof stored !== "object" ||
    Array.isArray(stored) ||
    Object.keys(stored).some(
      (key) =>
        ![
          "version",
          "kind",
          "binding",
          "trackingRef",
          "previousOid",
          "phase",
        ].includes(key),
    )
  )
    throw new PolicyError(
      "sync_journal_invalid",
      "Некорректный журнал синхронизации.",
    );
  const value = stored as Record<string, unknown>;
  if (
    value.version !== 1 ||
    value.kind !== action ||
    value.binding !== expected.binding ||
    value.trackingRef !== expected.trackingRef
  )
    throw new PolicyError(
      "request_conflict",
      "requestId уже привязан к другому назначению Git.",
    );
  if (
    ![
      "prepared",
      "fetching",
      "fetched",
      "applying",
      "succeeded",
      "unknown",
    ].includes(String(value.phase))
  )
    throw new PolicyError(
      "sync_journal_invalid",
      "Неизвестная фаза синхронизации.",
    );
  if (
    value.previousOid !== null &&
    (typeof value.previousOid !== "string" ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.previousOid) ||
      value.previousOid.length !== context.target.sourceOid.length ||
      /^0+$/.test(value.previousOid))
  )
    throw new PolicyError(
      "sync_journal_invalid",
      "Некорректное исходное значение tracking ref.",
    );
  return {
    ...expected,
    previousOid: value.previousOid as string | null,
    phase: value.phase as GitSyncJournal["phase"],
  };
}
