/**
 * @file src/components/admin/media/mapMediaLibraryItem.mapper.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проецирует штатную запись Media в безопасные данные карточки.
 * @see documentation/specifications/media-management.md
 */

import type { MediaLibraryItem } from "./MediaLibrary.types";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function identity(value: unknown): number | string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return typeof value === "string" &&
    value.trim().length > 0 &&
    !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

function numberMetadata(value: unknown, minimum: number): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum
    ? value
    : null;
}

/** Native Media возвращает корневой путь либо абсолютный HTTP(S) URL. */
function imageURL(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    /[\s\\\u0000-\u001f\u007f]/.test(value)
  )
    return null;
  if (value.startsWith("/")) return value.startsWith("//") ? null : value;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Не переносит caption, raw lock user, storage или неизвестные поля документа. */
export function mapMediaLibraryItem(value: unknown): MediaLibraryItem | null {
  const source = record(value);
  if (!source) return null;
  const id = identity(source.id);
  if (id === null) return null;
  const mimeType =
    typeof source.mimeType === "string" && source.mimeType.trim()
      ? source.mimeType.trim().toLowerCase()
      : null;
  const updatedAt =
    typeof source.updatedAt === "string" &&
    Number.isFinite(Date.parse(source.updatedAt))
      ? source.updatedAt
      : null;
  const isLocked = source._isLocked === true;
  return {
    id,
    filename:
      typeof source.filename === "string" && source.filename.trim()
        ? source.filename
        : "Файл без имени",
    alt: typeof source.alt === "string" ? source.alt : "",
    mimeType,
    filesize: numberMetadata(source.filesize, 0),
    width: numberMetadata(source.width, 1),
    height: numberMetadata(source.height, 1),
    previewURL: mimeType?.startsWith("image/")
      ? (imageURL(source.thumbnailURL) ?? imageURL(source.url))
      : null,
    updatedAt,
    isLocked,
    editingUserID: isLocked ? identity(record(source._userEditing)?.id) : null,
  };
}
