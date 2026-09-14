/**
 * @file src/collections/Pages/pagePublicationPolicy.constants.ts
 * @version 1.0.1
 * @date 2026-09-14
 * @description Фиксирует проверяемую область первой политики публикации статических страниц.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

/** Изменение правил меняет policyHash подтверждаемой операции. */
export const PAGE_PUBLICATION_POLICY = {
  version: "pages-static-publication:2.0",
  heroTypes: ["none", "lowImpact"],
  blockTypes: ["content", "banner"],
  textNodeTypes: [
    "root",
    "paragraph",
    "heading",
    "quote",
    "list",
    "listitem",
    "text",
    "tab",
    "linebreak",
    "horizontalrule",
  ],
  dependencies: "blocked",
  links: "blocked",
  sharedShell: "current",
  defaultMetadata: "current",
  maxBytes: 1024 * 1024,
  maxBlocks: 1000,
  maxNodes: 20000,
  maxTextDepth: 24,
  reservedSlugs: [
    "admin",
    "api",
    "next",
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
  ],
} as const;
