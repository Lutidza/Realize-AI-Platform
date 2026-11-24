/**
 * @file src/components/admin/documents/useArticleCreateForm.hook.ts
 * @version 1.1.0
 * @date 2026-11-24
 * @description Управляет черновиком статьи, проверкой результата записи и переходами.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ControlPanelPreviewState } from "../control-panel-preview/ControlPanelPreview.types";
import { parseControlPanelPreviewQuery } from "../control-panel-preview/parseControlPanelPreviewQuery.validator";
import type {
  ArticleCreateDraft,
  ArticleCreateNotice,
  ArticleSectionDraft,
} from "./ArticleCreateForm.types";
import type { DocumentArticleInput } from "./DocumentArticleForm.types";
import {
  checkCreatedDocumentArticleAction,
  createDocumentArticleAction,
} from "./createDocumentArticle.action";
import { validateDocumentArticleInput } from "./documentArticleInput.validator";
import { documentRoute } from "./documentRoutes.util";
import { matchesSubmittedDocumentArticle } from "./matchesSubmittedDocumentArticle.util";
import { suggestDocumentIdentifier } from "./suggestDocumentIdentifier.util";

const initialDraft: ArticleCreateDraft = {
  title: "",
  slug: "",
  manualSlug: false,
  description: "",
  sections: [
    {
      key: 0,
      title: "",
      anchor: "",
      manualAnchor: false,
      paragraphs: [{ key: 1, text: "" }],
    },
  ],
};

function toArticleInput({
  title,
  slug,
  description,
  sections,
}: ArticleCreateDraft): DocumentArticleInput {
  return {
    title,
    slug,
    description,
    sections: sections.map(({ title: sectionTitle, anchor, paragraphs }) => ({
      title: sectionTitle,
      anchor,
      paragraphs: paragraphs.map(({ text }) => ({ text })),
    })),
  };
}

function moveRow<T>(rows: T[], index: number, offset: -1 | 1): T[] {
  const next = index + offset;
  if (next < 0 || next >= rows.length) return rows;
  const result = [...rows];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}

/** Черновик и состояние запроса живут выше переключаемого renderer. */
export function useArticleCreateForm(
  fromPage: number,
  initialAppearance: ControlPanelPreviewState,
) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<ArticleCreateNotice | null>(null);
  const [operation, setOperation] = useState<
    "save" | "check" | "navigate" | null
  >(null);
  const [uncertain, setUncertain] = useState<DocumentArticleInput | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const rowKey = useRef(2);
  const operationLock = useRef(false);
  const active = useRef(true);
  const focusErrors = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (!focusErrors.current) return;
    focusErrors.current = false;
    const target =
      formRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"], [data-article-field-error]',
      ) ??
      formRef.current?.querySelector<HTMLElement>("[data-article-feedback]");
    target?.focus();
  }, [fieldErrors, notice]);

  function changeDraft(
    change: (current: ArticleCreateDraft) => ArticleCreateDraft,
    paths?: readonly string[],
  ) {
    setDraft(change);
    setNotice(null);
    setFieldErrors((current) =>
      paths
        ? Object.fromEntries(
            Object.entries(current).filter(([path]) => !paths.includes(path)),
          )
        : {},
    );
  }

  function updateSection(
    index: number,
    change: (section: ArticleSectionDraft) => ArticleSectionDraft,
    paths?: readonly string[],
  ) {
    changeDraft(
      (current) => ({
        ...current,
        sections: current.sections.map((section, currentIndex) =>
          currentIndex === index ? change(section) : section,
        ),
      }),
      paths,
    );
  }

  function navigate(slug?: string) {
    operationLock.current = true;
    setOperation("navigate");
    // Preview обновляет URL синхронно. После запроса берём оформление на момент перехода.
    const query = new URLSearchParams(window.location.search);
    const appearance = parseControlPanelPreviewQuery({
      mode: query.get("mode") ?? undefined,
      layout: query.get("layout") ?? undefined,
    });
    router.replace(
      documentRoute(fromPage, appearance ?? initialAppearance, slug),
    );
  }

  function requestCancel() {
    if (operationLock.current) return;
    const dirty =
      draft.title ||
      draft.slug ||
      draft.description ||
      draft.sections.length > 1 ||
      draft.sections.some(
        ({ title, anchor, paragraphs }) =>
          title ||
          anchor ||
          paragraphs.length > 1 ||
          paragraphs.some(({ text }) => text),
      );
    if (dirty) setDiscardOpen(true);
    else navigate();
  }

  function startOperation(next: "save" | "check") {
    if (operationLock.current) return false;
    operationLock.current = true;
    setOperation(next);
    setNotice(null);
    return true;
  }

  function endOperation() {
    operationLock.current = false;
    setOperation(null);
  }

  function showError(message: string, fields: Record<string, string> = {}) {
    focusErrors.current = true;
    setFieldErrors(fields);
    setNotice({ message, tone: "danger" });
  }

  async function save() {
    if (uncertain || !startOperation("save")) return;
    const parsed = validateDocumentArticleInput(toArticleInput(draft));
    if ("fields" in parsed) {
      showError("Проверьте отмеченные поля.", parsed.fields);
      endOperation();
      return;
    }
    const input = parsed.input;
    const result = await createDocumentArticleAction(input).catch(() => ({
      status: "uncertain" as const,
    }));
    if (!active.current) return;
    if (result.status === "created") {
      navigate(result.slug);
      return;
    }

    if (result.status === "invalid")
      showError("Проверьте отмеченные поля.", result.fields);
    else if (result.status === "forbidden")
      showError("Для сохранения нужна действующая сессия администратора.");
    else {
      setUncertain(input);
      showError(
        "Не удалось подтвердить сохранение. Проверьте, появилась ли статья по указанному адресу.",
      );
    }
    endOperation();
  }

  async function checkSave() {
    if (!uncertain || !startOperation("check")) return;
    const result = await checkCreatedDocumentArticleAction(
      uncertain.slug,
    ).catch(() => ({ status: "unavailable" as const }));
    if (!active.current) return;
    if (result.status === "found") {
      if (matchesSubmittedDocumentArticle(result.article, uncertain)) {
        navigate(result.article.slug);
        return;
      }
      setUncertain(null);
      showError("Проверьте адрес статьи.", {
        slug: "Этот адрес занят. Укажите другой адрес статьи.",
      });
    } else if (result.status === "missing") {
      setUncertain(null);
      setNotice({
        message:
          "Статья по этому адресу не найдена. Можно повторить сохранение.",
        tone: "neutral",
      });
    } else if (result.status === "forbidden") {
      showError(
        "Для проверки сохранения нужна действующая сессия администратора.",
      );
    } else {
      showError("Не удалось проверить сохранение. Повторите проверку.");
    }
    endOperation();
  }

  return {
    draft,
    fieldErrors,
    notice,
    operation,
    uncertain,
    discardOpen,
    formRef,
    cancelRef,
    save,
    checkSave,
    requestCancel,
    setDiscardOpen,
    discard: () => navigate(),
    changeTitle: (value: string) =>
      changeDraft(
        (current) => ({
          ...current,
          title: value,
          slug: current.manualSlug
            ? current.slug
            : suggestDocumentIdentifier(value),
        }),
        draft.manualSlug ? ["title"] : ["title", "slug"],
      ),
    changeSlug: (value: string) =>
      changeDraft(
        (current) => ({ ...current, slug: value, manualSlug: true }),
        ["slug"],
      ),
    resetSlug: () =>
      changeDraft(
        (current) => ({
          ...current,
          slug: suggestDocumentIdentifier(current.title),
          manualSlug: false,
        }),
        ["slug"],
      ),
    changeDescription: (value: string) =>
      changeDraft(
        (current) => ({ ...current, description: value }),
        ["description"],
      ),
    addSection: () => {
      const section = {
        key: rowKey.current++,
        title: "",
        anchor: "",
        manualAnchor: false,
        paragraphs: [{ key: rowKey.current++, text: "" }],
      };
      changeDraft((current) => ({
        ...current,
        sections: [...current.sections, section],
      }));
    },
    removeSection: (index: number) =>
      changeDraft((current) => ({
        ...current,
        sections:
          current.sections.length > 1
            ? current.sections.filter((_, i) => i !== index)
            : current.sections,
      })),
    moveSection: (index: number, offset: -1 | 1) =>
      changeDraft((current) => ({
        ...current,
        sections: moveRow(current.sections, index, offset),
      })),
    changeSectionTitle: (index: number, value: string) =>
      updateSection(
        index,
        (section) => ({
          ...section,
          title: value,
          anchor: section.manualAnchor
            ? section.anchor
            : suggestDocumentIdentifier(value),
        }),
        draft.sections[index].manualAnchor
          ? [`sections.${index}.title`]
          : [`sections.${index}.title`, `sections.${index}.anchor`, "sections"],
      ),
    changeAnchor: (index: number, value: string) =>
      updateSection(
        index,
        (section) => ({
          ...section,
          anchor: value,
          manualAnchor: true,
        }),
        [`sections.${index}.anchor`, "sections"],
      ),
    resetAnchor: (index: number) =>
      updateSection(
        index,
        (section) => ({
          ...section,
          anchor: suggestDocumentIdentifier(section.title),
          manualAnchor: false,
        }),
        [`sections.${index}.anchor`, "sections"],
      ),
    addParagraph: (index: number) => {
      const paragraph = { key: rowKey.current++, text: "" };
      updateSection(index, (section) => ({
        ...section,
        paragraphs: [...section.paragraphs, paragraph],
      }));
    },
    removeParagraph: (index: number, paragraphIndex: number) =>
      updateSection(index, (section) => ({
        ...section,
        paragraphs:
          section.paragraphs.length > 1
            ? section.paragraphs.filter((_, i) => i !== paragraphIndex)
            : section.paragraphs,
      })),
    moveParagraph: (index: number, paragraphIndex: number, offset: -1 | 1) =>
      updateSection(index, (section) => ({
        ...section,
        paragraphs: moveRow(section.paragraphs, paragraphIndex, offset),
      })),
    changeParagraph: (index: number, paragraphIndex: number, text: string) =>
      updateSection(
        index,
        (section) => ({
          ...section,
          paragraphs: section.paragraphs.map((paragraph, i) =>
            i === paragraphIndex ? { ...paragraph, text } : paragraph,
          ),
        }),
        [
          `sections.${index}.paragraphs.${paragraphIndex}.text`,
          `sections.${index}.paragraphs`,
        ],
      ),
  };
}
