/**
 * @file packages/ai-contracts/src/mcpToolInputs.config.ts
 * @version 1.5.0
 * @date 2026-10-22
 * @description Определяет строгие входы инструментов MCP без управляющего контекста клиента.
 * @see documentation/specifications/internal-mcp.md
 */
import { z } from "zod";
import { mcpWorkshopInputs } from "./mcpWorkshop.schemas";
import { aiContextInputSchema } from "./aiInstructionInputs.config";
import { repositorySearchIntent } from "./repositoryNavigation.schemas";

const path = z.string().max(4096);
const cursor = z.string().min(1).max(2048).optional();
const limit = z.number().int().min(1).max(100).default(50);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const mcpToolInputs = {
  ...mcpWorkshopInputs,
  realize_get_context: z.strictObject({}),
  ai_context_resolve: aiContextInputSchema,
  ai_capabilities_list: z.strictObject({}),
  ai_instructions_get: z.strictObject({
    path: path.min(1),
    startLine: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
    lineCount: z.number().int().min(1).max(400).default(200),
    expectedSha256: hash,
  }),
  repo_list_files: z.strictObject({
    path: path.default(""),
    depth: z.number().int().min(1).max(5).default(1),
    limit,
    cursor,
  }),
  repo_read_file: z.strictObject({
    path: path.min(1),
    startLine: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
    lineCount: z.number().int().min(1).max(400).default(200),
    expectedSha256: hash.optional(),
  }),
  repo_search: z
    .strictObject({
      intent: repositorySearchIntent.default("text"),
      query: z
        .string()
        .min(1)
        .max(512)
        .refine((text) => [...text].length <= 256),
      path: path.default(""),
      caseSensitive: z.boolean().default(false),
      resolveImports: z.boolean().optional(),
      maxDepth: z.number().int().min(1).max(12).optional(),
      limit,
      cursor,
    })
    .refine(
      (value) =>
        value.resolveImports
          ? value.intent === "imports" && value.path.length > 0
          : value.maxDepth === undefined,
      {
        message:
          "resolveImports требует intent=imports и точный path; maxDepth применим только к разрешению imports.",
      },
    ),
  repo_git_head: z.strictObject({}),
  repo_git_status: z.strictObject({ limit, cursor }),
  repo_git_diff: z.strictObject({
    scope: z.enum(["index", "working_tree"]),
    paths: z
      .array(path.min(1))
      .min(1)
      .max(20)
      .refine((paths) => new Set(paths).size === paths.length),
    contextLines: z.number().int().min(0).max(5).default(3),
    limitBytes: z.number().int().min(1024).max(65536).default(32768),
    cursor,
  }),
  pages_list: z.strictObject({
    query: z.string().trim().max(128).default(""),
    page: z.number().int().min(1).max(999999).default(1),
  }),
  pages_get: z.strictObject({ pageID: z.string().min(1).max(128) }),
  pages_get_structure: z
    .strictObject({
      pageID: z.string().min(1).max(128),
      offset: z.number().int().min(0).max(10000).multipleOf(32).default(0),
      fingerprint: hash.optional(),
      catalogHash: hash.optional(),
    })
    .refine(
      (value) =>
        value.offset === 0 || Boolean(value.fingerprint && value.catalogHash),
    ),
};
