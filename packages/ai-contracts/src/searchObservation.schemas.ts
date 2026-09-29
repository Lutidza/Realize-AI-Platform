/**
 * @file packages/ai-contracts/src/searchObservation.schemas.ts
 * @version 1.1.0
 * @date 2026-09-28
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

export const searchObservationQuerySchema = z.strictObject({
  source: z.enum(["cli", "mcp"]).optional(),
  outcome: z.enum(["complete", "partial", "error", "cancelled"]).optional(),
  hours: z.enum(["1", "24", "168"]).default("24"),
  before: z
    .string()
    .regex(/^[1-9]\d{0,14}$/)
    .optional(),
  slow: z.enum(["true"]).optional(),
});
