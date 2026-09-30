/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/workshopPreview.constants.ts
 * @version 1.0.0
 * @date 2026-09-26
 * @description Объясняет состояния задания и ошибки предпросмотра без внутренних логов.
 * @see documentation/specifications/design-workshop.md
 */
import type {
  DesignPreviewErrorCode,
  DesignPreviewJobDto,
} from "@realize/ai-contracts";

export const WORKSHOP_PREVIEW_POLL_MS = 4000;
export const WORKSHOP_PREVIEW_STATUS: Record<
  DesignPreviewJobDto["state"],
  string
> = {
  queued: "В очереди",
  running: "Сборка и съёмка",
  completed: "Готово",
  failed: "Не удалось создать preview",
  cancelled: "Отменено",
  expired: "Срок хранения истёк",
};
export const WORKSHOP_PREVIEW_ERRORS: Record<DesignPreviewErrorCode, string> = {
  UNAVAILABLE: "Исполнитель предпросмотра недоступен. Повторите запуск позже.",
  AUTH_REVOKED: "Доступ отозван во время выполнения задания.",
  SOURCE_INVALID: "Не удалось подтвердить сохранённую версию. Обновите проект.",
  BUILD_FAILED:
    "Макет не собрался. Проверьте импорты и default export выбранного React-компонента.",
  RENDER_FAILED:
    "Макет не удалось отобразить. Проверьте выполнение React-компонента.",
  TIMEOUT: "Макет не успел отобразиться за отведённое время.",
  LIMIT_EXCEEDED:
    "Макет превысил доступные ресурсы предпросмотра. Упростите его и повторите запуск.",
  ATTEMPTS_EXHAUSTED:
    "Исполнитель не завершил задание после повторных попыток. Запустите новое preview.",
  INTERNAL_ERROR: "Предпросмотр недоступен. Повторите запуск позже.",
};
