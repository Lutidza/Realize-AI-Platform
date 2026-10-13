/**
 * @file .ai/tools/task-workspace/src/Workspace.error.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Представляет безопасные ошибки локальных операций с досье.
 * @see documentation/specifications/task-management-execution.md
 */
export class WorkspaceError extends Error {
  constructor(code, message = "Операция локального досье отклонена.") {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
}
export function fail(code, message) {
  throw new WorkspaceError(code, message);
}
