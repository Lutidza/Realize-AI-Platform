/**
 * @file packages/template-realize/src/layouts/realizeStatusTitles.constants.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Задаёт доступные заголовки объявленных status screens Realize.
 */
export const REALIZE_STATUS_TITLES = {
  ru: {
    loading: "Загрузка",
    error: "Не удалось открыть страницу",
    "not-found": "Страница не найдена",
    forbidden: "Нет доступа",
    maintenance: "Техническое обслуживание",
  },
  en: {
    loading: "Loading",
    error: "Unable to open this page",
    "not-found": "Page not found",
    forbidden: "Access denied",
    maintenance: "Maintenance",
  },
} as const;
