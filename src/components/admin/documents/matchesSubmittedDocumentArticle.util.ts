/**
 * @file src/components/admin/documents/matchesSubmittedDocumentArticle.util.ts
 * @version 1.0.0
 * @date 2026-11-24
 * @description Сверяет полученную статью с нормализованным черновиком после потери ответа.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { DocumentArticleInput } from "./DocumentArticleForm.types";

/** Порядок разделов и абзацев, пробелы текста и ручные адреса входят в сравнение. */
export function matchesSubmittedDocumentArticle(
  stored: DocumentArticleInput,
  submitted: DocumentArticleInput,
): boolean {
  return (
    stored.slug === submitted.slug &&
    stored.title === submitted.title &&
    stored.description === submitted.description &&
    stored.sections.length === submitted.sections.length &&
    stored.sections.every((section, index) => {
      const expected = submitted.sections[index];
      return (
        section.title === expected.title &&
        section.anchor === expected.anchor &&
        section.paragraphs.length === expected.paragraphs.length &&
        section.paragraphs.every(
          ({ text }, row) => text === expected.paragraphs[row].text,
        )
      );
    })
  );
}
