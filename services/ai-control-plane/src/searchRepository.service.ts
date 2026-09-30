/**
 * @file services/ai-control-plane/src/searchRepository.service.ts
 * @version 1.3.0
 * @date 2026-09-28
 * @description Выполняет literal либо синтаксический поиск с безопасным чтением и привязкой к snapshot.
 */
import type { McpToolInput } from "../../../packages/ai-contracts/src/McpTool.types";
import type {
  RepositoryQueryContext,
  RepositorySearchMatch,
} from "./RepositoryQueries.types";
import { hashRepositorySnapshot } from "./RepositoryCursor.service";
import { RepositoryReadError } from "./RepositoryRead.error";
import { paginateRepositoryResult } from "./paginateRepositoryResult.service";
import {
  readRepositoryFile,
  assertRepositoryReadActive,
} from "./readRepositoryFile.service";
import { REPOSITORY_MAX_SCAN_BYTES } from "./repositoryReadPolicy.validator";
import { walkRepository } from "./walkRepository.service";
import {
  createNavigationCoverage,
  isSyntaxSearchFile,
  SYNTAX_MAX_FILE_BYTES,
} from "../../../.ai/tools/agent-search/src/syntaxSearch.config.mjs";
import { findRepositoryTextMatches } from "./findRepositoryTextMatches.util";
import { mapRepositorySyntaxMatches } from "./mapRepositorySyntaxMatches.mapper";

export async function searchRepository(
  context: RepositoryQueryContext,
  input: McpToolInput<"repo_search">,
) {
  if (input.resolveImports) {
    const { resolveRepositoryImports } =
      await import("./resolveRepositoryImports.service");
    return resolveRepositoryImports(context, input);
  }
  const navigation =
    input.intent !== "text" ? createNavigationCoverage() : undefined;
  const assertActive = () => assertRepositoryReadActive(context.signal);
  assertActive();
  // Parser загружается после проверки/чтения первого кандидата и не получает I/O policy.
  let analyzer:
    | typeof import("../../../.ai/tools/agent-search/src/analyzeSyntaxFile.util.mjs")
    | undefined;
  const scan = await walkRepository(context.policy, {
    path: input.path,
    signal: context.signal,
  });
  const matches: RepositorySearchMatch[] = [];
  const metrics = context.searchMetrics;
  if (metrics)
    metrics.candidateFiles = scan.entries.filter(
      (entry) => entry.type === "file",
    ).length;
  const snapshot: [string, string][] = [];
  let bytes = 0;
  let incomplete = scan.truncated;
  files: for (const entry of scan.entries.filter(
    (entry) => entry.type === "file",
  )) {
    assertActive();
    if (navigation && !isSyntaxSearchFile(entry.path)) {
      navigation.unsupportedFiles++;
      snapshot.push([entry.path, `unsupported:${entry.fingerprint}`]);
      continue;
    }
    if (navigation && (entry.size ?? 0) > SYNTAX_MAX_FILE_BYTES) {
      navigation.skippedFiles++;
      snapshot.push([entry.path, `excluded:${entry.fingerprint}`]);
      if (metrics) metrics.excludedFiles++;
      continue;
    }
    if (bytes + (entry.size ?? 0) > REPOSITORY_MAX_SCAN_BYTES) {
      incomplete = true;
      break;
    }
    try {
      const file = await readRepositoryFile(context.policy, entry.path, {
        signal: context.signal,
        ...(navigation ? { maximumBytes: SYNTAX_MAX_FILE_BYTES } : {}),
      });
      bytes += file.bytes.length;
      if (metrics) {
        metrics.filesRead++;
        metrics.bytesRead += file.bytes.length;
      }
      if (bytes > REPOSITORY_MAX_SCAN_BYTES) {
        incomplete = true;
        break;
      }
      snapshot.push([entry.path, file.sha256]);
      let found: Iterable<Omit<RepositorySearchMatch, "path" | "fileSha256">>;
      if (navigation && input.intent !== "text") {
        analyzer ??=
          await import("../../../.ai/tools/agent-search/src/analyzeSyntaxFile.util.mjs");
        const analysis = analyzer.analyzeSyntaxFile(entry.path, file.text, {
          intent: input.intent,
          query: input.query,
          caseSensitive: input.caseSensitive,
          assertActive,
        });
        assertActive();
        if (analysis.status === "prefiltered") {
          navigation.prefilteredFiles++;
          continue;
        }
        if (analysis.status === "syntax_error") {
          navigation.syntaxErrorFiles++;
          continue;
        }
        if (analysis.status !== "parsed") {
          navigation.skippedFiles++;
          continue;
        }
        navigation.parsedFiles++;
        found = mapRepositorySyntaxMatches(analysis.matches);
      } else found = findRepositoryTextMatches(file.text, input, assertActive);
      for (const match of found) {
        assertActive();
        if (matches.length >= 10000) {
          incomplete = true;
          break files;
        }
        if (metrics && metrics.firstMatchMs === null)
          metrics.firstMatchMs = performance.now() - metrics.started;
        matches.push({ path: entry.path, ...match, fileSha256: file.sha256 });
      }
    } catch (error) {
      if (
        error instanceof RepositoryReadError &&
        ["FORBIDDEN", "RESULT_LIMIT"].includes(error.code)
      ) {
        snapshot.push([entry.path, `excluded:${entry.fingerprint}`]);
        if (metrics) metrics.excludedFiles++;
        if (navigation) navigation.skippedFiles++;
        continue;
      }
      throw error;
    }
  }
  const snapshotHash = hashRepositorySnapshot(snapshot);
  const page = paginateRepositoryResult(
    matches,
    context,
    {
      tool: "search",
      path: input.path,
      query: input.query,
      caseSensitive: input.caseSensitive,
      limit: input.limit,
      ...(navigation ? { intent: input.intent } : {}),
    },
    snapshotHash,
    input.cursor,
    input.limit,
    incomplete,
  );
  return {
    matches: page.items,
    ...(navigation ? { navigation } : {}),
    snapshotHash: incomplete ? null : snapshotHash,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    truncationReason: page.truncationReason,
  };
}
