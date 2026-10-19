/**
 * @file src/components/admin/access-tokens/AccessClient.error.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Представляет безопасную ошибку browser API без ответа сервера и credentials.
 * @see documentation/architecture/platform-access.md
 */

const ACCESS_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Войдите в платформу заново, затем обновите страницу.",
  FORBIDDEN: "У вас нет права выполнять это действие.",
  INVALID_INPUT: "Проверьте заполненные поля и повторите запрос.",
  INVALID_REQUEST: "Проверьте заполненные поля и повторите запрос.",
  NOT_FOUND:
    "Доступ или запрос не найден. Обновите список или проверьте код CLI.",
  RATE_LIMITED: "Слишком много запросов. Подождите и повторите проверку.",
  DEVICE_EXPIRED: "Время подтверждения истекло. Запустите login в CLI заново.",
  DEVICE_CONFLICT: "Этот запрос уже обработан. Обновите его состояние.",
  INVALID_RESPONSE: "Не удалось подтвердить ответ сервера. Обновите состояние.",
  NETWORK_ERROR:
    "Не удалось выполнить запрос. Проверьте подключение и обновите состояние.",
  REQUEST_FAILED:
    "Не удалось выполнить запрос. Проверьте подключение и обновите состояние.",
};

/** Не сохраняет raw body, причину fetch или секретные аргументы запроса. */
export class AccessClientError extends Error {
  public readonly code: string;
  constructor(
    code: string,
    public readonly uncertain = false,
  ) {
    const safeCode = Object.hasOwn(ACCESS_ERROR_MESSAGES, code)
      ? code
      : "REQUEST_FAILED";
    super(ACCESS_ERROR_MESSAGES[safeCode]);
    this.code = safeCode;
    this.name = "AccessClientError";
  }
}
