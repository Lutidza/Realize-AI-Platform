/**
 * @file packages/ai-contracts/src/importResolution.schemas.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Задаёт закрытый DTO статического разрешения импорта, причин отказа и бюджета обхода.
 * @see documentation/architecture/repository-search.md
 */
import { z } from "zod";

const count = z.number().int().nonnegative();
const location = z.strictObject({
  path: z.string().min(1).max(4096),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  name: z.string().max(512).optional(),
  kind: z.enum([
    "module",
    "function",
    "class",
    "type",
    "interface",
    "enum",
    "variable",
    "namespace",
    "import",
    "export",
  ]),
  fileSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
const reason = z.enum([
  "external_dependency",
  "not_found",
  "forbidden",
  "file_too_large",
  "unsupported_specifier",
  "unsupported_configuration",
  "unsupported_export",
  "unsupported_language",
  "syntax_error",
  "symbol_not_exported",
  "ambiguous",
  "cycle",
  "max_depth",
  "scan_budget",
]);
export const importResolutionSchema = z
  .strictObject({
    status: z.enum(["resolved", "unresolved"]),
    reason: reason.nullable(),
    target: location.nullable(),
    chain: z.array(location).max(12),
  })
  .refine((value) =>
    value.status === "resolved"
      ? value.target !== null && value.reason === null
      : value.target === null && value.reason !== null,
  );
export const importResolutionCoverageSchema = z.strictObject({
  precision: z.literal("static_imports"),
  maxDepth: z.number().int().min(1).max(12),
  maxFiles: z.literal(128),
  maxReadBytes: z.literal(4194304),
  filesRead: count.max(128),
  bytesRead: count.max(4194304),
  probes: count.max(1024),
  blockedCandidates: count.max(1024),
  unresolvedMatches: count.max(1000),
  exhausted: z.boolean(),
});
