/**
 * @file services/ai-control-plane/src/buildRepositorySearchObservation.mapper.ts
 * @version 1.3.0
 * @date 2026-09-30
 * @description Преобразует измерения MCP в allowlist без текста запроса и найденного кода.
 */
import { mcpToolInputs, type SearchObservation } from "@realize/ai-contracts";
import type { RepositorySearchMetrics } from "./RepositoryQueries.types";
import {
  REPOSITORY_MAX_SCAN_BYTES,
  REPOSITORY_MAX_FILE_BYTES,
} from "./repositoryReadPolicy.validator";
import { IMPORT_RESOLUTION_LIMITS } from "../../../.ai/tools/agent-search/src/importResolution.config.mjs";

export function buildSearchObservation(
  input: unknown,
  metrics: RepositorySearchMetrics,
  result: { structuredContent: unknown; content: unknown[]; isError?: boolean },
  requestID: string,
  observedAt: string,
  code: string,
  responseBytes: number,
  options: {
    tool?: "repo_search" | "repo_read_file" | "repo_list_files";
    outputBytes?: number;
    cancelled?: boolean;
  } = {},
): SearchObservation {
  const tool = options.tool ?? "repo_search";
  const parsed = mcpToolInputs[tool].safeParse(input);
  const search =
    tool === "repo_search"
      ? mcpToolInputs.repo_search.safeParse(input)
      : undefined;
  const read =
    tool === "repo_read_file"
      ? mcpToolInputs.repo_read_file.safeParse(input)
      : undefined;
  const list =
    tool === "repo_list_files"
      ? mcpToolInputs.repo_list_files.safeParse(input)
      : undefined;
  const envelope = result.structuredContent as {
    ok: boolean;
    data?: {
      matches?: unknown[];
      entries?: unknown[];
      nextLine?: number | null;
      nextCursor?: string | null;
      truncated?: boolean;
      truncationReason?: "page_limit" | "response_bytes" | "scan_budget" | null;
      navigation?: { skippedFiles: number; syntaxErrorFiles: number };
      resolution?: { unresolvedMatches: number };
    };
  };
  const incompleteAnalysis = Boolean(
    (envelope.data?.navigation &&
      (envelope.data.navigation.skippedFiles ||
        envelope.data.navigation.syntaxErrorFiles)) ||
    envelope.data?.resolution?.unresolvedMatches,
  );
  const reasons: Record<string, SearchObservation["reason"]> = {
    TIMEOUT: "timeout",
    FORBIDDEN: "forbidden",
    RATE_LIMITED: "rate_limited",
    INVALID_CURSOR: "invalid_cursor",
    INVALID_INPUT: "invalid_input",
    DEPENDENCY_UNAVAILABLE: "dependency_unavailable",
    RESULT_LIMIT: "response_bytes",
  };
  return {
    schemaVersion: "1.0",
    eventID: requestID,
    observedAt,
    source: "mcp",
    operation:
      tool !== "repo_search"
        ? "files"
        : search?.success && search.data.intent !== "text"
          ? search.data.intent
          : "matches",
    queryKind:
      tool === "repo_list_files" ||
      (search?.success &&
        search.data.intent === "imports" &&
        search.data.query === "*")
        ? "glob"
        : "literal",
    caseSensitive: search?.success ? search.data.caseSensitive : true,
    narrowed:
      parsed.success && Boolean(parsed.data.path && parsed.data.path !== "."),
    profile: "mcp",
    outcome: options.cancelled
      ? "cancelled"
      : !envelope.ok
        ? "error"
        : envelope.data?.truncated || incompleteAnalysis
          ? "partial"
          : "complete",
    reason: options.cancelled
      ? "cancelled"
      : envelope.ok
        ? (envelope.data?.truncationReason ??
          (incompleteAnalysis ? "analysis_coverage" : null))
        : (reasons[code] ?? "internal_error"),
    durationMs: performance.now() - metrics.started,
    firstMatchMs: metrics.firstMatchMs,
    candidateFiles: metrics.candidateFiles,
    filesRead: metrics.filesRead,
    bytesRead: metrics.bytesRead,
    excludedFiles: metrics.excludedFiles,
    returnedCount: envelope.ok
      ? tool === "repo_read_file"
        ? 1
        : tool === "repo_list_files"
          ? (envelope.data?.entries?.length ?? 0)
          : (envelope.data?.matches?.length ?? 0)
      : 0,
    outputBytes:
      options.outputBytes ?? Buffer.byteLength(JSON.stringify(result)),
    outputUnit: "mcp_result_json_utf8",
    continuationRequested: Boolean(
      (search?.success && search.data.cursor) ||
      (list?.success && list.data.cursor),
    ),
    continuationOffered: Boolean(
      envelope.ok && (envelope.data?.nextCursor || envelope.data?.nextLine),
    ),
    limits: {
      results: search?.success
        ? search.data.limit
        : read?.success
          ? read.data.lineCount
          : list?.success
            ? list.data.limit
            : 0,
      responseBytes,
      timeoutMs: 10000,
      scanBytes:
        tool === "repo_read_file"
          ? REPOSITORY_MAX_FILE_BYTES
          : tool === "repo_list_files"
            ? null
            : search?.success && search.data.resolveImports
              ? IMPORT_RESOLUTION_LIMITS.bytes
              : REPOSITORY_MAX_SCAN_BYTES,
    },
    coordinates:
      tool === "repo_list_files" ? "none" : "unicode_codepoints_1based",
    tool,
    modelTokens: null,
  };
}
