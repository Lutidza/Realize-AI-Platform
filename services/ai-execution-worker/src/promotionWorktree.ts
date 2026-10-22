/**
 * @file services/ai-execution-worker/src/promotionWorktree.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Применяет точный принятый diff в изолированном preview worktree под общим Git lease.
 */
import { createHash } from "node:crypto";
import { Git, withGitRepositoryLock } from "@realize/git-runtime";
import { WorktreePolicyError } from "./WorktreePolicy.error";
import type { PreparePromotionWorktreeInput } from "./WorkerWorktree.types";
import { createBoundWorktree } from "./worktree";
import { readVerifiedPromotionDiff } from "./readVerifiedPromotionDiff.service";
import { removePromotionWorktree } from "./removePromotionWorktree.service";

/** Создание и применение занимают короткие фазы; проверки сборки и review не удерживают Git lock. */
export const preparePromotionWorktree = async (
  input: PreparePromotionWorktreeInput,
): Promise<string> => {
  if (
    createHash("sha256").update(input.job.diff).digest("hex") !==
    input.job.sourceDiffHash
  )
    throw new WorktreePolicyError(
      "Stored diff content no longer matches its hash.",
    );
  const workspace = await createBoundWorktree({
    baseCommit: input.job.baseCommit,
    branch: input.job.branch,
    repositoryRoot: input.repositoryRoot,
    workspaceID: input.job.workspaceID,
    workspaceRoot: input.workspaceRoot,
    existingLease: input.existingLease,
  });
  try {
    return await withGitRepositoryLock(
      { repositoryRoot: workspace, existingLease: input.existingLease },
      async (lease) => {
        const git = new Git(workspace, { profile: "service" });
        git.attachLock(lease);
        try {
          const [head, branch, status] = await Promise.all([
            git.run(["rev-parse", "HEAD"]),
            git.run(["symbolic-ref", "--quiet", "--short", "HEAD"], {
              acceptedExitCodes: [0, 1],
            }),
            git.run(["status", "--porcelain", "--untracked-files=all"]),
          ]);
          if (
            head.trim() !== input.job.baseCommit ||
            branch.trim() !== input.job.branch ||
            status.trim()
          )
            throw new WorktreePolicyError(
              "Promotion worktree changed before applying the accepted diff.",
            );
          try {
            await git.run(["apply", "--check", "--index", "--binary"], {
              input: input.job.diff,
            });
            await git.run(["apply", "--index", "--binary"], {
              input: input.job.diff,
            });
          } catch {
            throw new WorktreePolicyError(
              "git apply rejected the accepted diff.",
            );
          }
          await readVerifiedPromotionDiff({
            job: input.job,
            workspace,
            existingLease: lease,
          });
          return workspace;
        } finally {
          git.detachLock();
        }
      },
    );
  } catch (error) {
    try {
      await removePromotionWorktree({
        branch: input.job.branch,
        repositoryRoot: input.repositoryRoot,
        workspaceID: input.job.workspaceID,
        workspaceRoot: input.workspaceRoot,
        existingLease: input.existingLease,
      });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Promotion preparation and cleanup both failed.",
      );
    }
    throw error;
  }
};
