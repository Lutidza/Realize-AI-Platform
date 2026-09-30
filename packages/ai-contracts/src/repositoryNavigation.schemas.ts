/**
 * @file packages/ai-contracts/src/repositoryNavigation.schemas.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Задаёт синтаксическую точность и покрытие навигации без обещания связи символов.
 * @see documentation/architecture/repository-search.md
 */
import { z } from "zod";

export const repositorySearchIntent = z.enum([
  "text",
  "definitions",
  "references",
  "imports",
]);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const repositorySyntaxMatch = z.strictObject({
  kind: z.enum([
    "function",
    "class",
    "method",
    "type",
    "interface",
    "enum",
    "variable",
    "property",
    "parameter",
    "namespace",
    "reference",
    "import",
    "export",
    "dynamic_import",
    "require",
  ]),
  name: z.string().max(512).optional(),
  moduleSpecifier: z.string().max(4096).optional(),
  importedName: z.string().max(512).optional(),
});
export const repositoryNavigationCoverage = z.strictObject({
  precision: z.literal("syntax"),
  languages: z.literal("typescript_javascript"),
  parsedFiles: count,
  prefilteredFiles: count,
  unsupportedFiles: count,
  skippedFiles: count,
  syntaxErrorFiles: count,
  maxFileBytes: z.literal(524288),
});
