/**
 * @file src/components/admin/media/MediaLibrary.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Определяет проекцию файла для рабочей библиотеки и настройки сетки.
 * @see documentation/specifications/media-management.md
 */

/** Тип ID сохраняется для совместимости со штатным SelectionProvider Payload. */
export interface MediaLibraryItem {
  id: number | string;
  filename: string;
  alt: string;
  mimeType: string | null;
  filesize: number | null;
  width: number | null;
  height: number | null;
  previewURL: string | null;
  updatedAt: string | null;
  isLocked: boolean;
  editingUserID: number | string | null;
}

export interface MediaLibraryGridProps {
  enableRowSelections?: boolean;
}
