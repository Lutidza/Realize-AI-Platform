/**
 * @file services/ai-control-plane/src/searchRepository.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Выполняет ограниченный буквальный поиск с полным content snapshot разрешённых кандидатов.
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

export async function searchRepository(
  context: RepositoryQueryContext,
  input: McpToolInput<"repo_search">,
) {
  const scan = await walkRepository(context.policy, {
    path: input.path,
    signal: context.signal,
  });
  const matches: RepositorySearchMatch[] = [];
  const snapshot: [string, string][] = [];
  let bytes = 0;
  let incomplete = scan.truncated;
  const query = input.caseSensitive ? input.query : input.query.toLowerCase();
  for (const entry of scan.entries.filter((entry) => entry.type === "file")) {
    assertRepositoryReadActive(context.signal);
    if (bytes + (entry.size ?? 0) > REPOSITORY_MAX_SCAN_BYTES) {
      incomplete = true;
      break;
    }
    try {
      const file = await readRepositoryFile(context.policy, entry.path, {
        signal: context.signal,
      });
      bytes += file.bytes.length;
      if (bytes > REPOSITORY_MAX_SCAN_BYTES) {
        incomplete = true;
        break;
      }
      snapshot.push([entry.path, file.sha256]);
      const lines = file.text.split("\n");
      for (let index = 0; index < lines.length; index++) {
        assertRepositoryReadActive(context.signal);
        const points = [...lines[index]];
        // Поиск по code points сохраняет исходную колонку при Unicode lower-case expansion.
        const normalized: string[] = [];
        const columns: number[] = [];
        for (let column = 0; column < points.length; column++) {
          const point = input.caseSensitive
            ? points[column]
            : points[column].toLowerCase();
          normalized.push(point);
          for (let unit = 0; unit < point.length; unit++) columns.push(column);
        }
        const haystack = normalized.join("");
        for (
          let offset = haystack.indexOf(query);
          offset !== -1;
          offset = haystack.indexOf(query, offset + Math.max(1, query.length))
        ) {
          if (matches.length >= 10000) {
            incomplete = true;
            break;
          }
          const column = columns[offset];
          const snippetStart = Math.max(0, column - 100);
          matches.push({
            path: entry.path,
            line: index + 1,
            column: column + 1,
            snippet: points.slice(snippetStart, snippetStart + 500).join(""),
            fileSha256: file.sha256,
          });
        }
      }
    } catch (error) {
      if (
        error instanceof RepositoryReadError &&
        ["FORBIDDEN", "RESULT_LIMIT"].includes(error.code)
      ) {
        snapshot.push([entry.path, `excluded:${entry.fingerprint}`]);
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
    },
    snapshotHash,
    input.cursor,
    input.limit,
    incomplete,
  );
  return {
    matches: page.items,
    snapshotHash: incomplete ? null : snapshotHash,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    truncationReason: page.truncationReason,
  };
}
