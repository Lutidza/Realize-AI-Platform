/**
 * @file src/components/admin/documents/DocumentArticleForm.types.ts
 * @version 1.1.1
 * @date 2026-11-24
 * @description Определяет вход и результаты серверных действий формы создания статьи.
 * @see documentation/specifications/realize-ai-control-panel/documents/creation.md
 */

export type DocumentArticleInput = {
  title: string;
  slug: string;
  description: string;
  sections: {
    title: string;
    anchor: string;
    paragraphs: { text: string }[];
  }[];
};

/** Ошибки вложенных полей привязаны к порядку разделов и абзацев запроса. */
export type DocumentArticleFieldErrors = Record<string, string>;

export type CreateDocumentArticleResult =
  | { status: "created"; slug: string }
  | { status: "invalid"; fields: DocumentArticleFieldErrors }
  | { status: "forbidden" }
  | { status: "uncertain" };

/** Совпадение проверяется по адресу и содержимому отправленной версии статьи. */
export type CheckCreatedDocumentArticleResult =
  | { status: "found"; article: DocumentArticleInput }
  | { status: "missing" }
  | { status: "forbidden" }
  | { status: "unavailable" };
