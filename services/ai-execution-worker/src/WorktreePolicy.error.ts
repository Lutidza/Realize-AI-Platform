/**
 * @file services/ai-execution-worker/src/WorktreePolicy.error.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Обозначает нарушение привязки или области worktree, запрещающее автоматический retry.
 */

export class WorktreePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreePolicyError";
  }
}
