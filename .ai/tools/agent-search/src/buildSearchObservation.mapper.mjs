/**
 * @file .ai/tools/agent-search/src/buildSearchObservation.mapper.mjs
 * @version 1.2.0
 * @date 2026-09-28
 * @description Формирует только разрешённые измерения поиска без текста запроса и путей.
 * @see documentation/architecture/repository-search.md
 */
import { randomUUID } from "node:crypto";
import { IMPORT_RESOLUTION_LIMITS } from "./importResolution.config.mjs";

export function buildSearchObservation(options, result, observedAt) {
  const incompleteAnalysis = Boolean(
    (result.navigation &&
      (result.navigation.skippedFiles || result.navigation.syntaxErrorFiles)) ||
    result.resolution?.unresolvedMatches,
  );
  const reasons = {
    limit: "page_limit",
    bytes: "response_bytes",
    timeout: "timeout",
    cancelled: "cancelled",
    scan_budget: "scan_budget",
  };
  return {
    schemaVersion: "1.0",
    eventID: randomUUID(),
    observedAt,
    source: "cli",
    operation:
      options.intent && options.intent !== "text"
        ? options.intent
        : options.output,
    queryKind:
      options.output === "paths" ||
      (options.intent === "imports" && options.query === "*")
        ? "glob"
        : options.fixed
          ? "literal"
          : "regex",
    caseSensitive: !options.ignoreCase,
    narrowed: Boolean(
      options.from ||
      options.within.length ||
      options.globs.length ||
      options.extensions.length,
    ),
    profile: options.mode,
    outcome:
      result.stopped === "cancelled"
        ? "cancelled"
        : result.failure
          ? "error"
          : result.stopped || incompleteAnalysis
            ? "partial"
            : "complete",
    reason:
      reasons[result.stopped] ??
      (result.failure
        ? "internal_error"
        : incompleteAnalysis
          ? "analysis_coverage"
          : null),
    durationMs: result.metrics.durationMs,
    firstMatchMs: result.metrics.firstMatchMs,
    candidateFiles: result.metrics.candidateFiles,
    filesRead:
      options.output === "paths" ? 0 : (result.metrics.filesRead ?? null),
    bytesRead:
      options.output === "paths" ? 0 : (result.metrics.bytesRead ?? null),
    excludedFiles: result.metrics.excludedFiles ?? null,
    returnedCount: result.records.length,
    outputBytes: result.metrics.outputBytes,
    outputUnit: "cli_records_utf8",
    continuationRequested: false,
    continuationOffered: false,
    limits: {
      results: options.limit,
      responseBytes: options.maxBytes,
      timeoutMs: options.timeoutMs,
      scanBytes: options.resolveImports ? IMPORT_RESOLUTION_LIMITS.bytes : null,
    },
    coordinates: options.output === "matches" ? "utf8_bytes_1based" : "none",
    modelTokens: null,
  };
}
