/**
 * @file packages/payload-access-management/src/server/AccessManagement.error.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Представляет безопасную ошибку API без credentials и внутренних исключений.
 * @see documentation/architecture/platform-access.md
 */
/** Только фиксированные сообщения этой ошибки допускаются через HTTP boundary. */
export class AccessManagementError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AccessManagementError";
  }
}
export const accessUnauthenticated = () =>
  new AccessManagementError(
    "UNAUTHENTICATED",
    "Требуется действующий доступ.",
    401,
  );
export const accessForbidden = () =>
  new AccessManagementError(
    "FORBIDDEN",
    "Недостаточно прав для операции.",
    403,
  );
export const accessNotFound = () =>
  new AccessManagementError("NOT_FOUND", "Доступ или запрос не найден.", 404);
