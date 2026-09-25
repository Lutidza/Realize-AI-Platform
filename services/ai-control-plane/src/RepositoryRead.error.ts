/**
 * @file services/ai-control-plane/src/RepositoryRead.error.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Передаёт безопасные причины отказа при чтении репозитория.
 */

/** Сообщение не содержит абсолютных путей или отклонённых байтов. */
export class RepositoryReadError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_CURSOR"
      | "RESULT_LIMIT"
      | "TIMEOUT",
    message: string,
  ) {
    super(message);
    this.name = "RepositoryReadError";
  }
}
