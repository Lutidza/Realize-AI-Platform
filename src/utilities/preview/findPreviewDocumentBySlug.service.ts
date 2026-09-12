/**
 * @file src/utilities/preview/findPreviewDocumentBySlug.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Читает страницу или товар с повторной проверкой доступа к черновику.
 * @see documentation/project-context.md
 */

import configPromise from "@payload-config";
import { getPayload } from "payload";
import { draftMode, headers } from "next/headers";
import { getPreviewUser } from "./getPreviewUser.service";
import type { PreviewCollection, PreviewDocumentArgs } from "./preview.types";

/** Без актуальных прав preview возвращает только опубликованную версию или null. */
export async function findPreviewDocumentBySlug<T extends PreviewCollection>({
  collection,
  slug,
}: PreviewDocumentArgs<T>) {
  const { isEnabled } = await draftMode();
  const payload = await getPayload({ config: configPromise });
  const user = isEnabled
    ? await getPreviewUser(payload, await headers())
    : null;
  const draft = Boolean(user);

  // Не кэшируем авторизацию между запросами: logout и отзыв роли действуют сразу.
  const result = await payload.find({
    collection,
    draft,
    user,
    overrideAccess: false,
    limit: 1,
    pagination: false,
    where: {
      and: [
        { slug: { equals: slug } },
        ...(draft ? [] : [{ _status: { equals: "published" } }]),
      ],
    },
    ...(collection === "products"
      ? {
          depth: 3,
          populate: {
            variants: {
              title: true,
              priceInUSD: true,
              inventory: true,
              options: true,
            },
          },
        }
      : {}),
  });

  return result.docs[0] ?? null;
}
