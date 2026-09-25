/**
 * @file .ai/tools/git-delivery/src/read/readGitStatus.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Возвращает статусы только разрешённых путей из read-only снимка Git.
 */
import type { McpToolInput } from "../../../../../packages/ai-contracts/src/McpTool.types";
import { paginateRepositoryResult } from "../../../../../services/ai-control-plane/src/paginateRepositoryResult.service";
import type { GitReadContext } from "./GitRead.types";
import { captureGitReadSnapshot } from "./captureGitReadSnapshot.service";

export async function readGitStatus(
  context: GitReadContext,
  input: McpToolInput<"repo_git_status">,
) {
  const snapshot = await captureGitReadSnapshot(context);
  const entries = snapshot.files.flatMap((file) => {
    const status = (
      before: { oid: string; mode: string } | null,
      after: { oid: string; mode: string } | null,
    ) =>
      !before
        ? after
          ? "A"
          : " "
        : !after
          ? "D"
          : before.oid !== after.oid || before.mode !== after.mode
            ? "M"
            : " ";
    const untracked = !file.head && !file.index && !file.conflicted;
    const indexStatus = file.conflicted
      ? "U"
      : untracked
        ? "?"
        : status(file.head, file.index);
    const worktreeStatus = file.conflicted
      ? "U"
      : untracked
        ? "?"
        : status(file.index, file.working);
    return indexStatus === " " && worktreeStatus === " "
      ? []
      : [
          {
            path: file.path,
            indexStatus,
            worktreeStatus,
            conflicted: file.conflicted,
          },
        ];
  });
  const page = paginateRepositoryResult(
    entries,
    context,
    { tool: "status", limit: input.limit },
    snapshot.snapshotHash,
    input.cursor,
    input.limit,
  );
  return {
    branch: snapshot.branch,
    head: snapshot.head,
    detached: snapshot.detached,
    unborn: snapshot.unborn,
    entries: page.items,
    snapshotHash: snapshot.snapshotHash,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    truncationReason: page.truncationReason,
  };
}
