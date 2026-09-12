/**
 * @file src/utilities/preview/preview.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Контракты ссылок и чтения документов предпросмотра витрины.
 */

import type { PayloadRequest } from "payload";

export type PreviewCollection = "pages" | "products";

export type PreviewSearchParams = { path: string; previewSecret: string };

export type PreviewPathArgs = {
  collection: PreviewCollection;
  slug: string;
  req: PayloadRequest;
};

export type PreviewDocumentArgs<T extends PreviewCollection> = {
  collection: T;
  slug: string;
};
