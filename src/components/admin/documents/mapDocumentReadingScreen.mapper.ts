/**
 * @file src/components/admin/documents/mapDocumentReadingScreen.mapper.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Преобразует разрешённый документ Payload в узкий DTO экрана чтения без служебных полей.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { isDocumentSlug } from "@/collections/Documents/documentIdentifiers";
import type {
  DocumentReadingScreenProps,
  DocumentReadingSection,
} from "./DocumentReadingScreen.types";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, maximum?: number): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  (maximum === undefined || value.length <= maximum);

/** Повреждённое содержимое не передаётся в UI; native IDs и исходный документ не возвращаются. */
export function mapDocumentReadingScreen(
  document: unknown,
): DocumentReadingScreenProps | null {
  if (
    !record(document) ||
    !text(document.title, 160) ||
    typeof document.updatedAt !== "string" ||
    !Array.isArray(document.sections) ||
    !document.sections.length
  )
    return null;
  const timestamp = Date.parse(document.updatedAt);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== document.updatedAt
  )
    return null;
  let description: string | undefined;
  if (document.description !== undefined && document.description !== null) {
    if (
      typeof document.description !== "string" ||
      document.description.length > 1000
    )
      return null;
    description = document.description.trim() || undefined;
  }
  const anchors = new Set<string>();
  const sections: DocumentReadingSection[] = [];
  for (const section of document.sections) {
    if (
      !record(section) ||
      !isDocumentSlug(section.anchor) ||
      anchors.has(section.anchor) ||
      !text(section.title, 160) ||
      !Array.isArray(section.paragraphs) ||
      !section.paragraphs.length
    )
      return null;
    anchors.add(section.anchor);
    const paragraphs: string[] = [];
    for (const paragraph of section.paragraphs) {
      if (!record(paragraph) || !text(paragraph.text)) return null;
      paragraphs.push(paragraph.text.trim());
    }
    sections.push({
      id: section.anchor,
      title: section.title.trim(),
      paragraphs,
    });
  }
  return {
    title: document.title.trim(),
    ...(description === undefined ? {} : { description }),
    updatedAt: document.updatedAt,
    sections,
  };
}
