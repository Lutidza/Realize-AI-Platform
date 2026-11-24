/**
 * @file src/components/admin/documents/formatDocumentUpdatedDate.util.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Форматирует дату обновления одинаково в списке и чтении.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */

const updatedDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Вход — ISO timestamp документа, отображение не зависит от зоны сервера. */
export function formatDocumentUpdatedDate(updatedAt: string): string {
  return updatedDate.format(new Date(updatedAt));
}
