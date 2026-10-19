/**
 * @file .ai/tools/task-workspace/src/remote/RemoteWorkspace.repository.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Хранит атомарный журнал удалённого владения и блокирует второго локального писателя.
 * @see documentation/specifications/task-management-execution.md
 */
import { runtimeRoot } from "../workspacePaths.config.mjs";
import { safeTaskKey } from "../filesystem/safeTaskKey.validator.mjs";
import { fail } from "../Workspace.error.mjs";
import { remoteWorkspaceRecordSchema } from "./remoteWorkspaceRecord.validator.mjs";

/** @param {string} key */
export const remoteWorkspaceRecordPath = (key) =>
  `${runtimeRoot}/remote/${safeTaskKey(key)}.json`;

/** Чтение не создаёт каталогов; повреждённый журнал закрывает возможность записи.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key
 * @returns {import('./RemoteWorkspace.types').RemoteWorkspaceRecord | null}
 */
export function readRemoteWorkspaceRecord(storage, key) {
  const file = remoteWorkspaceRecordPath(key);
  if (!storage.exists(file)) return null;
  const parsed = remoteWorkspaceRecordSchema.safeParse(
    storage.json(file, 1024 * 1024),
  );
  if (!parsed.success || parsed.data.key !== key)
    fail("remote_journal_invalid");
  return parsed.data;
}

/** Caller удерживает общий task flock; writeJson выполняет fsync и atomic rename.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('./RemoteWorkspace.types').RemoteWorkspaceRecord} record
 */
export function writeRemoteWorkspaceRecord(storage, record) {
  storage.writeJson(
    remoteWorkspaceRecordPath(record.key),
    remoteWorkspaceRecordSchema.parse(record),
  );
}

/** Проверяется внутри общего mutation lock, включая прямые вызовы локальных services.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} key
 */
export function assertLocalWorkspaceOwnership(storage, key) {
  const binding = readRemoteWorkspaceRecord(storage, key);
  if (binding?.phase === "pending")
    fail(
      "remote_sync_pending",
      "Передача задачи не завершена; повторите sync с прежним target.",
    );
  if (binding?.phase === "remote")
    fail(
      "remote_owned",
      "Задача передана в Task Manager; предметные изменения выполняются там.",
    );
}

/** @param {import('./RemoteWorkspace.types').RemoteWorkspaceRecord | null} record
 * @returns {import('./RemoteWorkspace.types').RemoteWorkspacePresentation}
 */
export function presentRemoteWorkspaceRecord(record) {
  return {
    backend: record && record.phase !== "queued" ? "task_manager" : "local",
    ownership:
      record?.phase === "pending"
        ? "pending"
        : record?.phase === "remote"
          ? "remote"
          : "local",
    binding: record
      ? {
          phase: record.phase,
          clientTaskId: record.clientTaskId,
          selection: record.selection,
          taskRef: record.taskRef,
        }
      : null,
    reason: record?.reason ?? null,
  };
}
