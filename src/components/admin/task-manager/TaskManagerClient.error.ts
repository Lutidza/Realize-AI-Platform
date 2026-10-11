/**
 * @file src/components/admin/task-manager/TaskManagerClient.error.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Передаёт ошибку API, конфликт ревизии и ошибки полей рабочим формам.
 * @see documentation/specifications/task-management-execution.md
 */

/** Ошибка не означает, что mutation отсутствует: при неизвестном исходе сохраняется idempotency key. */
export class TaskManagerClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "TaskManagerClientError";
  }
}
