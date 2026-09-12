/**
 * @file src/utilities/generatePreviewPath.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Формирует проверенную ссылку предпросмотра страницы или товара.
 */

import type {
  PreviewPathArgs,
  PreviewSearchParams,
} from "./preview/preview.types";
import { resolvePreviewPath } from "./preview/resolvePreviewPath.validator";

const collectionPrefixMap = {
  pages: "",
  products: "/products",
};

/** Не создаёт рабочую ссылку при отсутствующем секрете или некорректном slug. */
export const generatePreviewPath = ({ collection, slug }: PreviewPathArgs) => {
  if (!slug || !process.env.PREVIEW_SECRET) {
    return null;
  }

  const encodedSlug = encodeURIComponent(slug);
  const path = resolvePreviewPath(
    `${collectionPrefixMap[collection]}/${encodedSlug}`,
  );
  if (!path) return null;

  const encodedParams = new URLSearchParams({
    path,
    previewSecret: process.env.PREVIEW_SECRET,
  } satisfies PreviewSearchParams);

  const url = `/next/preview?${encodedParams.toString()}`;

  return url;
};
