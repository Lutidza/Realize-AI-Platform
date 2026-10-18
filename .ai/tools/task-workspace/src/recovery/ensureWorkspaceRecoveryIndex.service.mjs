/**
 * @file .ai/tools/task-workspace/src/recovery/ensureWorkspaceRecoveryIndex.service.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Строит ограниченный возобновляемый индекс прежних журналов под общей блокировкой.
 * @see documentation/specifications/task-management-execution.md
 */
import { acquireWorkspaceFileLock } from "../filesystem/withWorkspaceFileLock.adapter.mjs";
import { runtimeRoot } from "../workspacePaths.config.mjs";
import { fail } from "../Workspace.error.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import {
  WORKSPACE_RECOVERY_INDEX_PATH,
  WORKSPACE_LEGACY_LIMIT,
  WORKSPACE_OPERATION_MAX_BYTES,
  isWorkspaceRecord,
  inspectLegacyWorkspaceOperation,
  readWorkspaceLegacyReferences,
  writeWorkspaceLegacyReferences,
} from "./WorkspaceOperation.repository.mjs";

/** Чтение диагностики не запускает индексацию и не разрешает мутации.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @returns {import('./WorkspaceOperation.types.ts').WorkspaceRecoveryIndex | null}
 */
export function readWorkspaceRecoveryIndex(storage) {
  if (!storage.exists(WORKSPACE_RECOVERY_INDEX_PATH)) return null;
  const value = storage.json(WORKSPACE_RECOVERY_INDEX_PATH);
  if (
    !isWorkspaceRecord(value) ||
    value.schemaVersion !== 1 ||
    !["building", "ready"].includes(String(value.phase)) ||
    !Array.isArray(value.files) ||
    value.files.length > WORKSPACE_LEGACY_LIMIT ||
    value.files.some(
      (file) =>
        typeof file !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(file),
    ) ||
    new Set(value.files).size !== value.files.length ||
    !Number.isInteger(value.cursor) ||
    typeof value.cursor !== "number" ||
    value.cursor < 0 ||
    value.cursor > value.files.length ||
    (value.phase === "ready" && value.cursor !== value.files.length)
  )
    fail("recovery_index_invalid");
  return /** @type {import('./WorkspaceOperation.types.ts').WorkspaceRecoveryIndex} */ (
    value
  );
}

/**
 * Одна порция сохраняет каждую связь раньше cursor; неполная порция запрещает вход в мутацию.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {{lockHeld?: boolean, batchSize?: number}} [options]
 */
export function ensureWorkspaceRecoveryIndex(
  storage,
  { lockHeld = false, batchSize = 128 } = {},
) {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > WORKSPACE_LEGACY_LIMIT
  )
    fail("recovery_index_limit");
  const release = lockHeld
    ? null
    : acquireWorkspaceFileLock(storage, "recovery-index", "recovery-index");
  try {
    let index = readWorkspaceRecoveryIndex(storage);
    if (index?.phase === "ready") return index;
    if (!index) {
      const directory = `${runtimeRoot}/operations`;
      const entries = storage.exists(directory) ? storage.list(directory) : [];
      if (entries.length > WORKSPACE_LEGACY_LIMIT) fail("recovery_index_limit");
      const files = [];
      for (const name of entries) {
        const stat = storage.stat(`${directory}/${name}`);
        if (stat.isDirectory() && !stat.isSymbolicLink()) continue;
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name)
        )
          fail("legacy_operation_invalid");
        files.push(name);
      }
      index = { schemaVersion: 1, phase: "building", files, cursor: 0 };
      storage.writeJson(WORKSPACE_RECOVERY_INDEX_PATH, index, true);
    }
    const stop = Math.min(index.files.length, index.cursor + batchSize);
    while (index.cursor < stop) {
      const file = `${runtimeRoot}/operations/${index.files[index.cursor]}`;
      const { reference } = inspectLegacyWorkspaceOperation(
        storage.json(file, WORKSPACE_OPERATION_MAX_BYTES),
        file,
      );
      const refs = readWorkspaceLegacyReferences(storage, reference.key);
      const previous = refs.find(
        (item) => item.operationId === reference.operationId,
      );
      if (previous && canonicalHash(previous) !== canonicalHash(reference))
        fail("recovery_index_conflict");
      if (!previous) refs.push(reference);
      if (refs.filter((item) => !item.completed).length > 1)
        fail("legacy_operation_conflict");
      writeWorkspaceLegacyReferences(storage, reference.key, refs);
      index.cursor++;
      storage.writeJson(WORKSPACE_RECOVERY_INDEX_PATH, index);
    }
    if (index.cursor !== index.files.length) fail("recovery_index_incomplete");
    index.phase = "ready";
    storage.writeJson(WORKSPACE_RECOVERY_INDEX_PATH, index);
    return index;
  } finally {
    release?.();
  }
}
