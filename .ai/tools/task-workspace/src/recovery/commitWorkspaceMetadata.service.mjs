/**
 * @file .ai/tools/task-workspace/src/recovery/commitWorkspaceMetadata.service.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Продолжает точный упорядоченный план файловых записей в исходном журнале операции.
 * @see documentation/specifications/task-management-execution.md
 */
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { fail } from "../Workspace.error.mjs";
import {
  isWorkspaceRecord,
  WORKSPACE_OPERATION_MAX_BYTES,
} from "./WorkspaceOperation.repository.mjs";

/** @param {Buffer | string} bytes */
function exactText(bytes) {
  if (typeof bytes === "string") {
    if (Buffer.from(bytes).toString("utf8") !== bytes)
      fail("metadata_utf8_required");
    return bytes;
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text).equals(bytes)) fail("metadata_utf8_required");
  return text;
}

/** @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} file */
function currentText(storage, file) {
  return storage.exists(file)
    ? exactText(storage.read(file, WORKSPACE_OPERATION_MAX_BYTES))
    : null;
}

/** Снимок before и окончательный after готовятся до prepare, не во время восстановления.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} file @param {Buffer | string} afterBytesOrText
 * @returns {import('./WorkspaceOperation.types.ts').WorkspaceFileWrite}
 */
export function planWorkspaceFile(storage, file, afterBytesOrText) {
  const path = safeRelative(file);
  return {
    path,
    before: currentText(storage, path),
    after: exactText(afterBytesOrText),
  };
}

/** @param {unknown} value @returns {import('./WorkspaceOperation.types.ts').WorkspaceFileWrite[]} */
function validateWrites(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4096)
    fail("metadata_plan_invalid");
  for (const item of value) {
    if (
      !isWorkspaceRecord(item) ||
      typeof item.path !== "string" ||
      (item.before !== null && typeof item.before !== "string") ||
      typeof item.after !== "string"
    )
      fail("metadata_plan_invalid");
    safeRelative(item.path);
    exactText(item.after);
    if (item.before !== null) exactText(item.before);
  }
  if (new Set(value.map((item) => item.path)).size !== value.length)
    fail("metadata_plan_invalid");
  return /** @type {import('./WorkspaceOperation.types.ts').WorkspaceFileWrite[]} */ (
    value
  );
}

/** @param {unknown} value @returns {string[]} */
function validateAbsentPaths(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4096)
    fail("metadata_plan_invalid");
  const paths = value.map((file) => safeRelative(file));
  if (new Set(paths).size !== paths.length) fail("metadata_plan_invalid");
  return paths;
}

/**
 * Разрешён только подтверждённый prefix и максимум одна запись перед сохранением cursor.
 * No-op строки проверяются без перезаписи; отсутствовавший файл создаётся исключительно.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceMetadataContext} context
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceFileWrite[]} writes
 * @param {string} [cursorKey]
 */
export function commitWorkspaceMetadata(
  storage,
  context,
  writes,
  cursorKey = "metadataCursor",
) {
  const journal = context.journal;
  if (
    !journal ||
    journal.phase !== "prepared" ||
    !/^[a-zA-Z][a-zA-Z0-9]*$/.test(cursorKey)
  )
    fail("metadata_context_required");
  const planKey =
    cursorKey === "metadataCursor" ? "writes" : `${cursorKey}Writes`;
  const planned = validateWrites(journal.data[planKey]);
  if (canonicalHash(planned) !== canonicalHash(validateWrites(writes)))
    fail("metadata_plan_conflict");
  for (const path of validateAbsentPaths(journal.data.absentPaths)) {
    if (storage.exists(path)) fail("metadata_state_conflict");
  }
  const cursorValue = journal.data[cursorKey] ?? 0;
  if (
    typeof cursorValue !== "number" ||
    !Number.isInteger(cursorValue) ||
    cursorValue < 0 ||
    cursorValue > planned.length
  )
    fail("metadata_cursor_invalid");
  let cursor = cursorValue;
  const current = planned.map((write) => currentText(storage, write.path));
  for (let index = 0; index < planned.length; index++) {
    const write = planned[index];
    const actual = current[index];
    if (
      index < cursor
        ? actual !== write.after
        : index === cursor
          ? actual !== write.before && actual !== write.after
          : actual !== write.before
    )
      fail("metadata_state_conflict");
  }
  while (cursor < planned.length) {
    const write = planned[cursor];
    const actual = currentText(storage, write.path);
    if (actual !== write.before && actual !== write.after)
      fail("metadata_state_conflict");
    if (actual !== write.after)
      storage.write(write.path, write.after, write.before === null);
    cursor++;
    journal.data[cursorKey] = cursor;
    context.save();
  }
}

/** Восстанавливает обычную операцию, чей полный эффект описан data.writes и prepared result.
 * @template TResult
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {import('./WorkspaceOperation.types.ts').WorkspaceMutationContext<TResult>} context
 * @returns {TResult}
 */
export function resumeWorkspaceMetadataOperation(storage, context) {
  if (!context.journal || !Object.hasOwn(context.journal, "result"))
    fail("metadata_context_required");
  commitWorkspaceMetadata(
    storage,
    context,
    validateWrites(context.journal.data.writes),
  );
  return context.complete(/** @type {TResult} */ (context.journal.result));
}
