/**
 * @file src/components/admin/documents/DocumentReadingScreen.types.ts
 * @version 1.1.0
 * @date 2026-11-22
 * @description Определяет данные простого экрана чтения документа без связи с хранилищем.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { ReactNode } from "react";

/** Раздел документа; id уникален внутри экрана и сохраняется как anchor. */
export type DocumentReadingSection = Readonly<{
  id: string;
  title: string;
  paragraphs: readonly string[];
}>;

/** Представление получает готовый текст; updatedAt содержит валидную ISO дату. */
export type DocumentReadingScreenProps = Readonly<{
  title: string;
  description?: string;
  updatedAt: string;
  sections: readonly DocumentReadingSection[];
}>;

/** Маршрут может предоставить навигацию отдельно от данных документа. */
export type DocumentReadingScreenViewProps = DocumentReadingScreenProps & {
  navigation?: ReactNode;
};
