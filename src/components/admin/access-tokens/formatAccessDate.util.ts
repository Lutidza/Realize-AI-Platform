/**
 * @file src/components/admin/access-tokens/formatAccessDate.util.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Форматирует проверенные DTO даты доступа в локальном часовом поясе браузера.
 * @see documentation/architecture/platform-access.md
 */
export const formatAccessDate = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
