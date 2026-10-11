/**
 * @file packages/payload-task-manager/src/server/TaskManager.error.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Передаёт безопасные доменные ошибки Task Manager транспортным адаптерам.
 * @see documentation/specifications/task-management-execution.md
 */
/** SQL, документы, секреты и server stack не входят в публичный error envelope. */
export class TaskManagerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "TaskManagerError";
  }
}
