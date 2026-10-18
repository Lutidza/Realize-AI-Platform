/**
 * @file .ai/tools/task-workspace/src/consumers/WorkspaceProcess.types.ts
 * @version 1.0.0
 * @date 2026-10-15
 * @description Описывает результат ограниченной проверки ссылок процессов на файловый путь.
 * @see documentation/specifications/task-management-execution.md
 */

/** Проверяются доступные cwd/exe/fd и pathname argv того же UID; окружение не читается. */
export type WorkspaceProcessReferences = {
  references: number[];
  inaccessible: number;
  scope: "accessible same-UID cwd/exe/fd/pathname argv only; environment not read";
};
