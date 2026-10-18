/**
 * @file .ai/tools/task-workspace/src/cli/readWorkspaceInput.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Читает один ограниченный JSON из stdin или защищённого файлового пути с прежним UTF-8 decode.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import path from "node:path";
import { safeRelative } from "../filesystem/safeRelative.validator.mjs";
import { fail } from "../Workspace.error.mjs";
const inputLimit = 1024 * 1024;

/** @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage @param {string} value */
export function workspaceInputPath(storage, value) {
  const relative = path.isAbsolute(value)
    ? path.relative(storage.root, value)
    : value;
  safeRelative(relative);
  if (/(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|dump)$/.test(relative))
    fail("protected_input");
  return relative;
}

/** Один проход по stdin читает максимум limit+1 bytes и отклоняет превышение до выполнения сервиса.
 * @param {import('../filesystem/WorkspaceFs.adapter.mjs').WorkspaceFs} storage
 * @param {string} value
 * @returns {unknown}
 */
export function readWorkspaceInput(storage, value) {
  if (value !== "-")
    return storage.json(workspaceInputPath(storage, value), inputLimit);
  const bytes = Buffer.allocUnsafe(inputLimit + 1);
  let length = 0;
  for (;;) {
    let count;
    try {
      count = fs.readSync(0, bytes, length, bytes.length - length, null);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === "EINTR")
        continue;
      throw error;
    }
    length += count;
    if (length > inputLimit) fail("file_limit");
    if (!count) break;
  }
  try {
    return JSON.parse(bytes.subarray(0, length).toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail("invalid_json");
    throw error;
  }
}
