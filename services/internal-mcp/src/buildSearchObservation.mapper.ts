/**
 * @file services/internal-mcp/src/buildSearchObservation.mapper.ts
 * @version 1.2.0
 * @date 2026-09-28
 * @description Преобразует измерения MCP в allowlist без текста запроса и найденного кода.
 */
import { mcpToolInputs, type SearchObservation } from "@realize/ai-contracts";
import type { RepositorySearchMetrics } from "../../ai-control-plane/src/RepositoryQueries.types";
import { REPOSITORY_MAX_SCAN_BYTES } from "../../ai-control-plane/src/repositoryReadPolicy.validator";
import { IMPORT_RESOLUTION_LIMITS } from "../../../.ai/tools/agent-search/src/importResolution.config.mjs";

export function buildSearchObservation(
  input: unknown,
  metrics: RepositorySearchMetrics,
  result: { structuredContent: unknown; content: unknown[]; isError?: boolean },
  requestID: string,
  observedAt: string,
  code: string,
  responseBytes: number,
): SearchObservation {
  const parsed = mcpToolInputs.repo_search.safeParse(input);
  const envelope = result.structuredContent as {
    ok: boolean;
    data?: {
      matches?: unknown[];
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
      parsed.success && parsed.data.intent !== "text"
        ? parsed.data.intent
        : "matches",
    queryKind:
      parsed.success &&
      parsed.data.intent === "imports" &&
      parsed.data.query === "*"
        ? "glob"
        : "literal",
    caseSensitive: parsed.success ? parsed.data.caseSensitive : true,
    narrowed:
      parsed.success && Boolean(parsed.data.path && parsed.data.path !== "."),
    profile: "mcp",
    outcome: !envelope.ok
      ? "error"
      : envelope.data?.truncated || incompleteAnalysis
        ? "partial"
        : "complete",
    reason: envelope.ok
      ? (envelope.data?.truncationReason ??
        (incompleteAnalysis ? "analysis_coverage" : null))
      : (reasons[code] ?? "internal_error"),
    durationMs: performance.now() - metrics.started,
    firstMatchMs: metrics.firstMatchMs,
    candidateFiles: metrics.candidateFiles,
    filesRead: metrics.filesRead,
    bytesRead: metrics.bytesRead,
    excludedFiles: metrics.excludedFiles,
    returnedCount: envelope.ok ? (envelope.data?.matches?.length ?? 0) : 0,
    outputBytes: Buffer.byteLength(JSON.stringify(result)),
    outputUnit: "mcp_result_json_utf8",
    continuationRequested: parsed.success && Boolean(parsed.data.cursor),
    continuationOffered: Boolean(envelope.ok && envelope.data?.nextCursor),
    limits: {
      results: parsed.success ? parsed.data.limit : 0,
      responseBytes,
      timeoutMs: 10000,
      scanBytes:
        parsed.success && parsed.data.resolveImports
          ? IMPORT_RESOLUTION_LIMITS.bytes
          : REPOSITORY_MAX_SCAN_BYTES,
    },
    coordinates: "unicode_codepoints_1based",
    modelTokens: null,
  };
}
