/**
 * @file packages/payload-extension-manager/src/server/ExtensionManagerHttp.error.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Ограничивает transport ошибки безопасными сообщениями без provider exception.
 * @see documentation/specifications/extension-management.md
 */
import type { ExtensionHttpErrorCode } from "../ExtensionManager.types";

const messages: Record<ExtensionHttpErrorCode, string> = {
  UNAUTHENTICATED: "Войдите в панель управления.",
  FORBIDDEN: "Недостаточно прав для этой операции.",
  INVALID_REQUEST:
    "Запрос некорректен. Проверьте настройки и повторите действие.",
  STORAGE_UNAVAILABLE:
    "Хранилище временно недоступно. Повторите запрос с тем же ключом сохранения.",
  SCHEMA_REQUIRED:
    "Сохранение оформления станет доступно после подготовки схемы менеджера расширений.",
  DELIVERY_ADAPTER_UNAVAILABLE:
    "Установка новых пакетов ещё не подключена к процессу доставки проекта.",
};
const statuses: Record<ExtensionHttpErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  STORAGE_UNAVAILABLE: 503,
  SCHEMA_REQUIRED: 503,
  DELIVERY_ADAPTER_UNAVAILABLE: 503,
};

/** Code и message — allowlist; exception text и input не становятся публичным ответом. */
export class ExtensionManagerHttpError extends Error {
  readonly status: number;
  constructor(readonly code: ExtensionHttpErrorCode) {
    super(messages[code]);
    this.name = "ExtensionManagerHttpError";
    this.status = statuses[code];
  }
}
