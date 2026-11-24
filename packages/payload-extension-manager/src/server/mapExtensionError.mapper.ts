/**
 * @file packages/payload-extension-manager/src/server/mapExtensionError.mapper.ts
 * @version 1.3.0
 * @date 2026-11-18
 * @description Проецирует только allowlist кодов и понятных сообщений, исключая provider exception.
 * @see documentation/specifications/extension-management.md
 */
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import type { ExtensionManagerErrorCode } from "../appearance/ExtensionAppearance.types";
import { ExtensionManagerHttpError } from "./ExtensionManagerHttp.error";

const messages: Record<ExtensionManagerErrorCode, string> = {
  LAYOUT_BINDING_WRITES_DISABLED:
    "Подготовка нового формата назначения пока недоступна. Требуется совместимое обновление установки.",
  TEMPLATE_PREVIEW_ONLY:
    "Шаблон доступен для настройки и предпросмотра. Рабочее применение пока недоступно.",
  INVALID_POLICY: "Конфигурация оболочек требует проверки оператором.",
  POLICY_CHANGED: "Доступность оболочек изменилась. Подготовьте новый план.",
  SHELL_UNAVAILABLE: "Выбранная оболочка недоступна в этой установке.",
  INVALID_INPUT: "Параметры изменения некорректны.",
  INVALID_STORE: "Состояние оформления требует проверки оператором.",
  INVALID_CATALOG: "Каталог оформления временно недоступен.",
  INVALID_SETTINGS: "Настройки не соответствуют выбранному шаблону.",
  CATALOG_CHANGED:
    "Каталог изменился. Обновите страницу и подготовьте новый план.",
  REVISION_CONFLICT:
    "Оформление уже изменено другим запросом. Обновите состояние.",
  STATE_CHANGED: "Исходное оформление изменилось. Подготовьте новый план.",
  PLAN_NOT_FOUND: "План изменения не найден.",
  PLAN_EXPIRED: "Срок действия плана истёк. Подготовьте новый план.",
  PLAN_HASH_MISMATCH:
    "План изменился. Повторно проверьте его перед применением.",
  PLAN_ACTOR_MISMATCH: "Этот план принадлежит другому администратору.",
  NO_PREVIOUS_ASSIGNMENT: "Нет предыдущего оформления для восстановления.",
  REPLAY_CONFLICT: "Ключ запроса уже связан с другим изменением.",
  LIMIT_REACHED:
    "Достигнут предел подготовленных изменений. Дождитесь завершения предыдущих планов.",
  ASSIGNMENT_UNAVAILABLE:
    "Выбранное оформление недоступно для этой поверхности.",
};

/** Любая неизвестная ошибка превращается в безопасный storage отказ. */
export function mapExtensionError(error: unknown) {
  if (error instanceof ExtensionManagerError)
    return {
      status: error.status,
      error: { code: error.code, message: messages[error.code] },
    };
  const safe =
    error instanceof ExtensionManagerHttpError
      ? error
      : new ExtensionManagerHttpError("STORAGE_UNAVAILABLE");
  return {
    status: safe.status,
    error: { code: safe.code, message: safe.message },
  };
}
