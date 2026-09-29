/**
 * @file packages/ai-contracts/src/mcpToolOutputs.config.ts
 * @version 1.5.0
 * @date 2026-09-30
 * @description Задаёт закрытые wire schemas ответов MCP, включая существующие проекции Pages.
 * @see documentation/specifications/internal-mcp.md
 */
import { z } from "zod";
import {
  importResolutionSchema,
  importResolutionCoverageSchema,
} from "./importResolution.schemas";
import {
  repositorySyntaxMatch,
  repositoryNavigationCoverage,
} from "./repositoryNavigation.schemas";
import {
  aiContextOutputSchema,
  aiCapabilitiesOutputSchema,
  aiSourceAuthoritySchema,
} from "./aiInstructionOutputs.config";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const pageRef = z.strictObject({
  id: z.string(),
  title: z.string(),
  slug: z.string().optional(),
});
const locator = z.strictObject({ path: z.string(), exportName: z.string() });
const knowledge = z.strictObject({
  version: z.literal("1.0"),
  pageID: z.string(),
  fingerprint: hash,
  catalogHash: hash,
  definitions: z.array(
    z.strictObject({
      id: z.string(),
      version: z.string(),
      kind: z.enum(["collection", "block"]),
      title: z.string(),
      description: z.string(),
      schema: locator,
      renderer: locator,
      guide: z.strictObject({
        source: z.string(),
        version: z.string(),
        instructions: z.array(z.string()),
      }),
      supportedOperations: z.array(
        z.strictObject({ id: z.string(), version: z.string() }),
      ),
      fields: z.array(
        z.strictObject({
          path: z.string(),
          type: z.string(),
          required: z.boolean(),
          relationTo: z.array(z.string()).optional(),
        }),
      ),
    }),
  ),
  outline: z.strictObject({
    offset: integer,
    limit: z.literal(32),
    totalBlocks: integer,
    nextOffset: integer.nullable(),
    blocks: z
      .array(
        z.strictObject({
          id: z.string().nullable(),
          identity: z.enum(["stable", "missing", "duplicate"]),
          index: integer,
          path: z.string(),
          blockType: z.string(),
          definitionID: z.string().nullable(),
          settings: z.array(
            z.strictObject({
              path: z.string(),
              value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
            }),
          ),
          references: z.array(
            z.strictObject({
              field: z.literal("form"),
              collection: z.literal("forms"),
              id: z.string().nullable(),
              access: z.enum(["unresolved", "readable", "unavailable"]),
            }),
          ),
        }),
      )
      .max(32),
  }),
});
const pageWindow = {
  nextCursor: z.string().nullable(),
  truncated: z.boolean(),
  truncationReason: z
    .enum(["page_limit", "response_bytes", "scan_budget"])
    .nullable(),
};
const working = z.strictObject({
  source: z.literal("working_tree"),
  sha256: hash,
  byteLength: integer,
});
const identity = z.union([
  working,
  z.strictObject({
    source: z.enum(["head", "index"]),
    blobOID: z.string().regex(/^[a-f0-9]+$/),
    sha256: hash,
  }),
  z.strictObject({ source: z.literal("absent") }),
  z.strictObject({
    source: z.literal("unavailable"),
    reason: z.enum(["binary", "untracked", "unmerged"]),
  }),
]);
export const mcpToolDataSchemas = {
  ai_context_resolve: aiContextOutputSchema,
  ai_capabilities_list: aiCapabilitiesOutputSchema,
  ai_instructions_get: z.strictObject({
    path: z.string(),
    text: z.string(),
    authority: aiSourceAuthoritySchema,
    authorityOrigin: z.literal("server_path_policy"),
    grantsPermissions: z.literal(false),
    startLine: integer,
    endLine: integer,
    totalLines: integer,
    nextLine: integer.nullable(),
    truncated: z.boolean(),
    truncationReason: pageWindow.truncationReason,
    version: working,
  }),
  realize_get_context: z.strictObject({
    project: z.strictObject({ name: z.string(), version: z.string() }),
    server: z.strictObject({
      name: z.string(),
      version: z.string(),
      protocolVersions: z.array(z.string()),
    }),
    principal: z.strictObject({ id: z.string(), scopes: z.array(z.string()) }),
    installation: z.strictObject({ mode: z.literal("single"), id: z.string() }),
    modules: z.array(
      z.strictObject({
        id: z.enum(["repository", "pages"]),
        status: z.enum(["ready", "not_configured", "unavailable"]),
        reasonCode: z.string().nullable(),
      }),
    ),
    tools: z.array(
      z.strictObject({
        name: z.string(),
        inputSchemaVersion: z.literal("1.0"),
        outputSchemaVersion: z.literal("1.0"),
      }),
    ),
    repository: z
      .strictObject({
        branch: z.string().nullable(),
        head: z.string().nullable(),
        dirty: z.boolean(),
        dirtyScope: z.literal("allowed_paths"),
      })
      .nullable(),
  }),
  repo_list_files: z.strictObject({
    entries: z.array(
      z.strictObject({
        path: z.string(),
        type: z.enum(["file", "directory"]),
        size: integer.nullable(),
      }),
    ),
    policyVersion: z.string(),
    snapshotHash: hash,
    ...pageWindow,
  }),
  repo_read_file: z.strictObject({
    path: z.string(),
    text: z.string(),
    startLine: integer,
    endLine: integer,
    totalLines: integer,
    nextLine: integer.nullable(),
    truncated: z.boolean(),
    truncationReason: pageWindow.truncationReason,
    version: working,
  }),
  repo_search: z.strictObject({
    matches: z.array(
      z.strictObject({
        path: z.string(),
        line: integer,
        column: integer,
        snippet: z.string(),
        fileSha256: hash,
        syntax: repositorySyntaxMatch.optional(),
        resolution: importResolutionSchema.optional(),
      }),
    ),
    snapshotHash: hash.nullable(),
    navigation: repositoryNavigationCoverage.optional(),
    resolution: importResolutionCoverageSchema.optional(),
    ...pageWindow,
  }),
  repo_git_status: z.strictObject({
    branch: z.string().nullable(),
    head: z.string().nullable(),
    detached: z.boolean(),
    unborn: z.boolean(),
    entries: z.array(
      z.strictObject({
        path: z.string(),
        indexStatus: z.enum([" ", "M", "A", "D", "R", "C", "U", "?", "!", "T"]),
        worktreeStatus: z.enum([
          " ",
          "M",
          "A",
          "D",
          "R",
          "C",
          "U",
          "?",
          "!",
          "T",
        ]),
        conflicted: z.boolean(),
      }),
    ),
    snapshotHash: hash,
    ...pageWindow,
  }),
  repo_git_diff: z.strictObject({
    scope: z.enum(["index", "working_tree"]),
    snapshotHash: hash,
    files: z.array(
      z.strictObject({
        path: z.string(),
        before: identity,
        after: identity,
        patch: z.string(),
        status: z.enum([
          "modified",
          "added",
          "deleted",
          "unmerged",
          "binary",
          "untracked",
        ]),
        omittedReason: z.enum(["binary", "untracked", "unmerged"]).nullable(),
      }),
    ),
    ...pageWindow,
  }),
  pages_list: z.strictObject({
    pages: z.array(pageRef),
    page: integer,
    totalPages: integer,
    totalDocs: integer,
  }),
  pages_get: z.strictObject({
    page: pageRef,
    updatedAt: z.string(),
    fingerprint: hash,
    adapterVersion: z.string(),
    fields: z
      .array(
        z.strictObject({
          path: z.string(),
          label: z.string(),
          value: z.string(),
          maxLength: integer,
        }),
      )
      .max(128),
    knowledge: knowledge.optional(),
  }),
  pages_get_structure: z.strictObject({
    page: pageRef,
    updatedAt: z.string(),
    fingerprint: hash,
    knowledge,
  }),
};
export const mcpErrorCodes = [
  "INVALID_INPUT",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_CURSOR",
  "RESULT_LIMIT",
  "RATE_LIMITED",
  "DEPENDENCY_UNAVAILABLE",
  "TIMEOUT",
  "INTERNAL_ERROR",
] as const;
export const mcpErrorSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  ok: z.literal(false),
  requestID: z.string(),
  error: z.strictObject({
    code: z.enum(mcpErrorCodes),
    message: z.string(),
    retryable: z.boolean(),
  }),
});

/** Вход и выход остаются независимыми схемами; неизвестные поля на границе закрыты. */
export function createMcpToolOutputSchema(data: z.ZodType) {
  return z.union([
    z.strictObject({
      schemaVersion: z.literal("1.0"),
      ok: z.literal(true),
      data,
      requestID: z.string(),
      observedAt: z.string(),
    }),
    mcpErrorSchema,
  ]);
}
