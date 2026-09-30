/**
 * @file services/ai-control-plane/src/resolveRepositoryImports.service.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Формирует разрешённые import chains MCP и связывает cursor со всем прочитанным графом и конфигурацией.
 * @see documentation/architecture/repository-search.md
 */
import type { McpToolInput } from "../../../packages/ai-contracts/src/McpTool.types";
import type {
  RepositoryQueryContext,
  RepositorySearchMatch,
} from "./RepositoryQueries.types";
import {
  importResolutionSchema,
  importResolutionCoverageSchema,
} from "../../../packages/ai-contracts/src/importResolution.schemas";
import { resolveImportLinks } from "../../../.ai/tools/agent-search/src/resolveImportLinks.service.mjs";
import { IMPORT_RESOLUTION_LIMITS } from "../../../.ai/tools/agent-search/src/importResolution.config.mjs";
import { isSyntaxSearchFile } from "../../../.ai/tools/agent-search/src/syntaxSearch.config.mjs";
import { createImportReadAdapter } from "./createImportReadAdapter.adapter";
import { assertRepositoryReadActive } from "./readRepositoryFile.service";
import { parseRepositoryPath } from "./repositoryReadPolicy.validator";
import { RepositoryReadError } from "./RepositoryRead.error";
import { mapRepositorySyntaxMatches } from "./mapRepositorySyntaxMatches.mapper";
import { hashRepositorySnapshot } from "./RepositoryCursor.service";
import { paginateRepositoryResult } from "./paginateRepositoryResult.service";

export async function resolveRepositoryImports(
  context: RepositoryQueryContext,
  input: McpToolInput<"repo_search">,
) {
  parseRepositoryPath(input.path);
  if (input.intent !== "imports" || !isSyntaxSearchFile(input.path))
    throw new RepositoryReadError(
      "INVALID_INPUT",
      "Для разрешения imports нужен точный TS/JS файл.",
    );
  const maxDepth = input.maxDepth ?? IMPORT_RESOLUTION_LIMITS.defaultDepth;
  const metrics = context.searchMetrics;
  const result = await resolveImportLinks(
    input.path,
    {
      query: input.query,
      caseSensitive: input.caseSensitive,
      maxDepth,
      coordinateUnit: "unicode_codepoints",
      assertActive: () => assertRepositoryReadActive(context.signal),
      onMatch: () => {
        if (metrics && metrics.firstMatchMs === null)
          metrics.firstMatchMs = performance.now() - metrics.started;
      },
    },
    createImportReadAdapter(context),
  );
  if (metrics) {
    metrics.candidateFiles = result.resolution.probes;
    metrics.filesRead = result.resolution.filesRead;
    metrics.bytesRead = result.resolution.bytesRead;
    metrics.excludedFiles =
      result.navigation.skippedFiles + result.resolution.blockedCandidates;
  }
  if (
    ["not_found", "forbidden", "file_too_large"].includes(
      result.seedReason ?? "",
    )
  )
    throw new RepositoryReadError(
      result.seedReason === "not_found"
        ? "NOT_FOUND"
        : result.seedReason === "forbidden"
          ? "FORBIDDEN"
          : "RESULT_LIMIT",
      "Стартовый файл недоступен для разрешения imports.",
    );
  const matches: RepositorySearchMatch[] = result.matches.map((match) => ({
    path: input.path,
    ...[...mapRepositorySyntaxMatches([match])][0],
    fileSha256: result.seedHash!,
    resolution: importResolutionSchema.parse(match.resolution),
  }));
  const incomplete = result.resolution.exhausted || result.matchLimitReached;
  const snapshot = hashRepositorySnapshot(result.snapshot);
  const page = paginateRepositoryResult(
    matches,
    context,
    {
      tool: "search",
      path: input.path,
      query: input.query,
      caseSensitive: input.caseSensitive,
      intent: "imports",
      resolveImports: true,
      maxDepth,
      limit: input.limit,
      resolutionVersion: 1,
    },
    snapshot,
    input.cursor,
    input.limit,
    incomplete,
  );
  return {
    matches: page.items,
    navigation: result.navigation,
    resolution: importResolutionCoverageSchema.parse({
      ...result.resolution,
      exhausted: incomplete,
    }),
    snapshotHash: incomplete ? null : snapshot,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    truncationReason: page.truncationReason,
  };
}
