/**
 * @file packages/ai-contracts/src/searchObservation.schemas.ts
 * @version 1.4.0
 * @date 2026-11-03
 * @description Проверяет обезличенную диагностику поиска без запросов, путей и фрагментов кода.
 * @see documentation/architecture/repository-search.md
 */
import { z } from "zod";

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const timing = z.number().finite().min(0).max(86400000);

/** Null означает отсутствие измерения; ноль — измеренное нулевое значение. */
export const searchObservationSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  eventID: z.uuid(),
  observedAt: z.iso.datetime(),
  source: z.enum(["cli", "mcp"]),
  sourceVersion: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  installedBuildID: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .optional(),
  consumer: z
    .enum(["admin", "execution", "review", "chatgpt", "mcp", "cli"])
    .optional(),
  runID: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/)
    .optional(),
  tool: z.enum(["repo_search", "repo_read_file", "repo_list_files"]).optional(),
  operation: z.enum([
    "matches",
    "files",
    "paths",
    "definitions",
    "references",
    "imports",
  ]),
  queryKind: z.enum(["literal", "regex", "glob"]),
  caseSensitive: z.boolean(),
  narrowed: z.boolean(),
  profile: z
    .enum([
      "code",
      "docs",
      "code-docs",
      "ai-active",
      "ai",
      "codex",
      "next-routes",
      "payload",
      "ui",
      "migrations",
      "domain",
      "search-layer",
      "reference",
      "special",
      "mcp",
    ])
    .nullable(),
  outcome: z.enum(["complete", "partial", "error", "cancelled"]),
  reason: z
    .enum([
      "page_limit",
      "response_bytes",
      "scan_budget",
      "analysis_coverage",
      "timeout",
      "cancelled",
      "forbidden",
      "rate_limited",
      "invalid_cursor",
      "invalid_input",
      "dependency_unavailable",
      "internal_error",
    ])
    .nullable(),
  durationMs: timing,
  firstMatchMs: timing.nullable(),
  candidateFiles: count.nullable(),
  filesRead: count.nullable(),
  bytesRead: count.nullable(),
  excludedFiles: count.nullable(),
  returnedCount: count,
  outputBytes: count,
  outputUnit: z.enum(["cli_records_utf8", "mcp_result_json_utf8"]),
  continuationRequested: z.boolean(),
  continuationOffered: z.boolean(),
  limits: z.strictObject({
    results: count,
    responseBytes: count,
    timeoutMs: count,
    scanBytes: count.nullable(),
  }),
  coordinates: z.enum([
    "utf8_bytes_1based",
    "unicode_codepoints_1based",
    "none",
  ]),
  modelTokens: z.null(),
});

export const searchObservationQuerySchema = z
  .strictObject({
    consumer: searchObservationSchema.shape.consumer,
    source: z.enum(["cli", "mcp"]).optional(),
    operation: searchObservationSchema.shape.operation.optional(),
    compareAt: z.iso.datetime().optional(),
    outcome: z.enum(["complete", "partial", "error", "cancelled"]).optional(),
    hours: z.enum(["1", "24", "168"]).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    before: z
      .string()
      .regex(/^[1-9]\d{0,14}$/)
      .optional(),
    slow: z.enum(["true"]).optional(),
  })
  .superRefine((query, context) => {
    if (
      Boolean(query.from) !== Boolean(query.to) ||
      (query.from && query.hours)
    ) {
      context.addIssue({
        code: "custom",
        message: "Use hours or a complete from/to range.",
        path: ["from"],
      });
    }
    if (
      query.from &&
      query.to &&
      (Date.parse(query.from) >= Date.parse(query.to) ||
        Date.parse(query.to) - Date.parse(query.from) > 7 * 86400000)
    ) {
      context.addIssue({
        code: "custom",
        message: "Range must be positive and at most 7 days.",
        path: ["to"],
      });
    }
  })
  .transform((query) =>
    query.from ? query : { ...query, hours: query.hours ?? ("24" as const) },
  );
