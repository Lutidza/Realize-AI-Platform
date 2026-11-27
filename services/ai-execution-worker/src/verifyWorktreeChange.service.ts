/**
 * @file services/ai-execution-worker/src/verifyWorktreeChange.service.ts
 * @version 1.1.0
 * @date 2026-11-27
 * @description Сверяет фактический diff до и после проверок для managed и IDE Assignment.
 * @see documentation/specifications/internal-mcp.md
 */
import { captureWorktreeDiff } from "./captureWorktreeDiff.service";
import { WorktreePolicyError } from "./WorktreePolicy.error";
import type { WorktreeChangeScope, WorktreeDiff } from "./types";

/** Проверки могут обращаться к worktree. Выдача результата требует того же diff после завершения всех проверок. */
export async function verifyWorktreeChange(
  workspace: string,
  job: WorktreeChangeScope,
  check: (diff: WorktreeDiff) => Promise<void>,
): Promise<WorktreeDiff> {
  const diff = await captureWorktreeDiff(workspace, job);
  await check(diff);
  const verified = await captureWorktreeDiff(workspace, job);
  if (verified.diffHash !== diff.diffHash)
    throw new WorktreePolicyError("Worktree diff changed during validation.");
  return verified;
}
