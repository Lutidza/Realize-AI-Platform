/**
 * @file .ai/tools/task-workspace/src/filesystem/safeTaskKey.validator.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Проверяет ключ досье, используемый в путях хранилища и блокировки.
 * @see documentation/specifications/task-management-execution.md
 */
import { fail } from "../Workspace.error.mjs";

/**
 * Ограничивает ключ строчными латинскими буквами, цифрами и дефисами.
 * @param {unknown} value
 * @returns {string}
 */
export function safeTaskKey(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value))
    fail("unsafe_task_key");
  return value;
}
