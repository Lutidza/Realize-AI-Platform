/**
 * @file src/collections/Pages/mapAIPageDraft.mapper.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Преобразует текст плана AI в существующие Content/Lexical поля страницы.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type { CreatePageDraftIntent } from "@realize/ai-contracts";

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

const textNode = (text: string) => ({
  detail: 0,
  format: 0,
  mode: "normal",
  style: "",
  text,
  type: "text",
  version: 1,
});
const element = (
  type: "paragraph" | "heading",
  text: string,
  tag?: "h1" | "h2",
) => ({
  children: [textNode(text)],
  direction: "ltr",
  format: "",
  indent: 0,
  type,
  version: 1,
  ...(tag ? { tag } : { textFormat: 0, textStyle: "" }),
});
const richText = (children: Record<string, unknown>[]) => ({
  root: {
    children,
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

/** Plain text остаётся текстовыми узлами; модель не задаёт HTML, ссылки или произвольные блоки. */
export const mapAIPageDraftContent = (intent: CreatePageDraftIntent) => {
  if (reservedSlugs.has(intent.slug))
    throw new Error(
      "Этот адрес занят служебным разделом сайта. Выберите другой slug.",
    );
  return {
    hero: {
      type: "lowImpact",
      richText: richText([element("heading", intent.title, "h1")]),
      links: [],
    },
    layout: intent.sections.map((section) => ({
      blockType: "content",
      columns: [
        {
          size: "full",
          enableLink: false,
          richText: richText([
            ...(section.heading
              ? [element("heading", section.heading, "h2")]
              : []),
            ...section.body
              .split("\n")
              .map((line) => element("paragraph", line)),
          ]),
        },
      ],
    })),
    meta: {
      title: intent.title,
      ...(intent.description ? { description: intent.description } : {}),
    },
  };
};
