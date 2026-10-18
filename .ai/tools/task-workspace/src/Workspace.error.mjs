/**
 * @file .ai/tools/task-workspace/src/Workspace.error.mjs
 * @version 1.0.2
 * @date 2026-10-15
 * @description Представляет безопасные ошибки локальных операций с досье.
 * @see documentation/specifications/task-management-execution.md
 */
export class WorkspaceError extends Error {
  /** @type {import('./recovery/WorkspaceOperation.types.ts').WorkspaceOperationReference | undefined} */
  operation;
  /** @param {string} code @param {string} [message] */
  constructor(code, message = "Операция локального досье отклонена.") {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
}
/**
 * Прерывает операцию с машинным кодом и безопасным сообщением.
 * @param {string} code
 * @param {string} [message]
 * @returns {never}
 */
export function fail(code, message) {
  throw new WorkspaceError(code, message);
}
