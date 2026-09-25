/**
 * @file services/ai-control-plane/src/listRepositoryFiles.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Возвращает разрешённые metadata файлов с проверяемой пагинацией.
 */
import type { McpToolInput } from "../../../packages/ai-contracts/src/McpTool.types";
import type { RepositoryQueryContext } from "./RepositoryQueries.types";
import { hashRepositorySnapshot } from "./RepositoryCursor.service";
import { paginateRepositoryResult } from "./paginateRepositoryResult.service";
import { walkRepository } from "./walkRepository.service";

export async function listRepositoryFiles(
  context: RepositoryQueryContext,
  input: McpToolInput<"repo_list_files">,
) {
  const scan = await walkRepository(context.policy, {
    path: input.path,
    depth: input.depth,
    signal: context.signal,
  });
  const snapshotHash = hashRepositorySnapshot(scan.entries);
  const query = {
    tool: "list",
    path: input.path,
    depth: input.depth,
    limit: input.limit,
  };
  const page = paginateRepositoryResult(
    scan.entries.map(({ path, type, size }) => ({ path, type, size })),
    context,
    query,
    snapshotHash,
    input.cursor,
    input.limit,
    scan.truncated,
  );
  return {
    entries: page.items,
    policyVersion: context.policy.version,
    snapshotHash,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    truncationReason: page.truncationReason,
  };
}
