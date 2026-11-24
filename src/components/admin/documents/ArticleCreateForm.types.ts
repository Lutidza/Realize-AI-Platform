/**
 * @file src/components/admin/documents/ArticleCreateForm.types.ts
 * @version 1.0.1
 * @date 2026-11-24
 * @description Описывает UI-состояние черновика статьи и входные свойства формы.
 * @see documentation/specifications/realize-ai-control-panel/documents/creation.md
 */
import type { ControlPanelPreviewState } from "../control-panel-preview/ControlPanelPreview.types";
import type { useArticleCreateForm } from "./useArticleCreateForm.hook";

/** Начальный макет и тема проверены маршрутом, fromPage задаёт возврат в список. */
export type ArticleCreateFormProps = ControlPanelPreviewState & {
  fromPage: number;
};

export type ArticleParagraphDraft = {
  key: number;
  text: string;
};

export type ArticleSectionDraft = {
  key: number;
  title: string;
  anchor: string;
  manualAnchor: boolean;
  paragraphs: ArticleParagraphDraft[];
};

/** Ключи строк и режим автогенерации принадлежат только форме. */
export type ArticleCreateDraft = {
  title: string;
  slug: string;
  manualSlug: boolean;
  description: string;
  sections: ArticleSectionDraft[];
};

export type ArticleFieldProps = {
  path: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  required?: boolean;
  rows?: number;
  maxLength?: number;
  identifier?: boolean;
  onChange: (value: string) => void;
};

export type ArticleCreateNotice = {
  message: string;
  tone: "neutral" | "danger";
};

export type ArticleSectionFieldsProps = {
  index: number;
  section: ArticleSectionDraft;
  form: ReturnType<typeof useArticleCreateForm>;
};

export type ArticleRowActionsProps = {
  index: number;
  count: number;
  name: string;
  move: (offset: -1 | 1) => void;
  remove: () => void;
};
