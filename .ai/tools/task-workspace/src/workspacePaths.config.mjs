/**
 * @file .ai/tools/task-workspace/src/workspacePaths.config.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Определяет корень проекта и расположение runtime независимо от каталога запуска CLI.
 * @see documentation/specifications/task-management-execution.md
 */
import { fileURLToPath } from "node:url";

export const workspaceRoot = fileURLToPath(
  new URL("../../../../", import.meta.url),
);
export const runtimeRoot = ".ai/tools/task-workspace/runtime";
