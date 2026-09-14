/**
 * @file src/collections/Pages/pagePublicationRevalidation.service.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Инвалидирует только подтверждённые пути Pages после внешнего commit транзакции.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/17-preview-strategy.md
 */
import { revalidatePath } from "next/cache";
import type { PayloadRequest } from "payload";
import { PAGE_PUBLICATION_POLICY } from "./pagePublicationPolicy.constants";

/** Повтор доставки идемпотентен; отказ до commit не может инвалидировать незавершённую публикацию. */
export const revalidatePagePublication = async (
  slugs: string[],
  req: PayloadRequest,
): Promise<void> => {
  if ((await req.transactionID) != null)
    throw new Error(
      "Обновление витрины возможно только после сохранения операции.",
    );
  if (
    !Array.isArray(slugs) ||
    slugs.length < 1 ||
    slugs.length > 4 ||
    slugs.some(
      (slug) =>
        typeof slug !== "string" ||
        slug.length > 160 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        (PAGE_PUBLICATION_POLICY.reservedSlugs as readonly string[]).includes(
          slug,
        ),
    )
  )
    throw new Error("Некорректный набор адресов для обновления витрины.");
  // Сначала проверен весь набор; неправильный второй slug не вызывает частичной invalidation.
  for (const slug of new Set(slugs))
    revalidatePath(slug === "home" ? "/" : `/${slug}`);
};
