/**
 * @file src/components/admin/documents/DocumentList.types.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Определяет узкие данные списка административных документов.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */

/** Строка списка содержит только данные для ссылки и её краткого описания. */
export type DocumentListItem = Readonly<{
  slug: string;
  title: string;
  description?: string;
  updatedAt: string;
}>;

/** Номера страниц начинаются с единицы; пустой список имеет одну страницу. */
export type DocumentListPage = Readonly<{
  items: readonly DocumentListItem[];
  page: number;
  totalPages: number;
}>;
