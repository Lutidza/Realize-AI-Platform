/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/searchObservationPresentation.config.ts
 * @version 1.4.0
 * @date 2026-09-30
 * @description Даёт понятные подписи полноте, продолжению и ограничениям поиска.
 */
import type {
  SearchObservation,
  SearchObservationRuntimeStatus,
  SearchObservationMutationResult,
} from "@realize/ai-contracts";
export const searchOperationLabels: Record<
  SearchObservation["operation"],
  string
> = {
  matches: "Текстовые совпадения",
  files: "Файлы с совпадениями",
  paths: "Поиск путей",
  definitions: "Объявления",
  references: "Использования",
  imports: "Импорты",
};
export const searchTrendLabels = {
  averageMs: "Среднее время",
  completePercent: "Полнота выполнения",
  averageBytesRead: "Объём чтения",
} as const;
export const searchConsumerLabels = {
  admin: "Чат Admin",
  execution: "Исполнитель",
  review: "Reviewer",
  chatgpt: "Клиент ChatGPT",
  mcp: "Другой MCP",
  cli: "Agent CLI",
} as const;
export const searchRuntimeLabels: Record<
  SearchObservationRuntimeStatus["state"],
  string
> = {
  healthy: "Работает",
  delayed: "Сигнал задерживается",
  offline: "Нет связи",
  degraded: "Ошибка доставки",
};
export const searchCleanupLabels: Record<
  SearchObservationMutationResult["kind"],
  string
> = {
  settings: "Настройки применены",
  expired: "Очистка устаревшего",
  history: "Очистка истории",
};
export const searchOutcomeLabels: Record<SearchObservation["outcome"], string> =
  {
    complete: "Завершён",
    partial: "Неполная выдача",
    error: "Ошибка",
    cancelled: "Отменён",
  };
export const searchReasonLabels: Record<
  NonNullable<SearchObservation["reason"]>,
  string
> = {
  page_limit: "Лимит результатов",
  response_bytes: "Размер ответа",
  scan_budget: "Бюджет сканирования",
  analysis_coverage: "Не все файлы удалось разобрать или прочитать",
  timeout: "Время ожидания",
  cancelled: "Отмена",
  forbidden: "Доступ запрещён",
  rate_limited: "Частота запросов",
  invalid_cursor: "Продолжение недействительно",
  invalid_input: "Некорректные параметры",
  dependency_unavailable: "Зависимость недоступна",
  internal_error: "Внутренняя ошибка",
};
