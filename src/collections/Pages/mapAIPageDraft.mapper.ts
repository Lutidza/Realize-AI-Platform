/**
 * @file src/collections/Pages/mapAIPageDraft.mapper.ts
 * @version 1.0.1
 * @date 2026-09-13
 * @description Преобразует текст плана AI в существующие Content/Lexical поля страницы.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type { CreatePageDraftIntent } from "@realize/ai-contracts";
import { mapAIContentBlock } from "@/blocks/Content/mapAIContentBlock.mapper";
import { mapPlainTextRichText } from "@/fields/mapPlainTextRichText.mapper";

const reservedSlugs = new Set([
  "admin",
  "api",
  "home",
  "login",
  "logout",
  "products",
  "shop",
  "checkout",
  "forgot-password",
  "find-order",
  "create-account",
  "account",
  "orders",
]);

/** Plain text остаётся текстовыми узлами; модель не задаёт HTML, ссылки или произвольные блоки. */
export const mapAIPageDraftContent = (intent: CreatePageDraftIntent) => {
  if (reservedSlugs.has(intent.slug))
    throw new Error(
      "Этот адрес занят служебным разделом сайта. Выберите другой slug.",
    );
  return {
    hero: {
      type: "lowImpact",
      richText: mapPlainTextRichText([
        { type: "heading", text: intent.title, tag: "h1" },
      ]),
      links: [],
    },
    layout: intent.sections.map(mapAIContentBlock),
    meta: {
      title: intent.title,
      ...(intent.description ? { description: intent.description } : {}),
    },
  };
};
