/**
 * @file .ai/tools/task-workspace/src/filesystem/safeRelative.validator.mjs
 * @version 1.0.1
 * @date 2026-10-15
 * @description Проверяет относительный путь без обхода каталогов и файловых операций.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";
import { fail } from "../Workspace.error.mjs";

/**
 * Допускает непустые сегменты пути внутри корня без управляющих символов.
 * @param {unknown} value
 * @returns {string}
 */
export function safeRelative(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 2048 ||
    value.includes("\\") ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32) ||
    path.isAbsolute(value) ||
    value
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  )
    fail("unsafe_path");
  return value;
}
