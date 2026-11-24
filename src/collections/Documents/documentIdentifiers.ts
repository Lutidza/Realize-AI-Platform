/**
 * @file src/collections/Documents/documentIdentifiers.ts
 * @version 1.0.1
 * @date 2026-11-24
 * @description Проверяет явные адреса документов и стабильные anchors разделов.
 * @see documentation/specifications/realize-ai-control-panel/documents/collection-and-access.md
 */

/** Slug и anchor используют один строгий формат без автоматического переименования. */
export function isDocumentSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    value.trim() === value &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}
