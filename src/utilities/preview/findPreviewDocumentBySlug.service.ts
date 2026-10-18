/**
 * @file src/utilities/preview/findPreviewDocumentBySlug.service.ts
 * @version 1.0.1
 * @date 2026-10-18
 * @description Читает страницу или товар с повторной проверкой доступа к черновику.
 * @see documentation/project-context.md
 */

import configPromise from "@payload-config";
import { getPayload } from "payload";
import { draftMode, headers } from "next/headers";
import { connection } from "next/server";
import { getPreviewUser } from "./getPreviewUser.service";
import type { PreviewCollection, PreviewDocumentArgs } from "./preview.types";

/** Без актуальных прав preview возвращает только опубликованную версию или null. */
export async function findPreviewDocumentBySlug<T extends PreviewCollection>({
  collection,
  slug,
}: PreviewDocumentArgs<T>) {
  // draftMode() при prerender возвращает isEnabled=false и не откладывает чтение БД.
  if (process.env.REALIZE_BUILD_WITHOUT_DATABASE === "true") await connection();

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
