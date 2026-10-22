/**
 * @file services/ai-execution-worker/src/readVerifiedPromotionDiff.service.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет staged diff, commit, ветку и scope перед review или служебным commit.
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 */
import { createHash } from "node:crypto";
import { Git, withGitRepositoryLock } from "@realize/git-runtime";
import { assertWorktreePathSafety } from "./assertWorktreePathSafety.validator";
import { WorktreePolicyError } from "./WorktreePolicy.error";
import type { PromotionArtifactInput } from "./WorkerWorktree.types";

/** Возвращает только проверенный diff; borrowed lease позволяет commit продолжить ту же атомарную фазу. */
export async function readVerifiedPromotionDiff(
  input: PromotionArtifactInput,
): Promise<string> {
  return withGitRepositoryLock(
    { repositoryRoot: input.workspace, existingLease: input.existingLease },
    async (lease) => {
      const git = new Git(input.workspace, { profile: "service" });
      git.attachLock(lease);
      try {
        const [head, branch, paths, stagedDiff, unstaged] = await Promise.all([
          git.run(["rev-parse", "HEAD"]),
          git.run(["symbolic-ref", "--quiet", "--short", "HEAD"], {
            acceptedExitCodes: [0, 1],
          }),
          git.run([
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--cached",
            "--name-only",
            "-z",
            "HEAD",
            "--",
          ]),
          git.run([
            "diff",
            "--no-textconv",
            "--cached",
            "--binary",
            "--no-ext-diff",
            "HEAD",
            "--",
          ]),
          git.run([
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--name-only",
            "-z",
            "--",
          ]),
        ]);
        if (
          head.trim() !== input.job.baseCommit ||
          branch.trim() !== input.job.branch
        )
          throw new WorktreePolicyError(
            "Promotion worktree moved away from the bound commit or branch.",
          );
        const actualPaths = paths.split("\0").filter(Boolean).sort();
        if (
          JSON.stringify(actualPaths) !==
          JSON.stringify([...input.job.expectedPaths].sort())
        )
          throw new WorktreePolicyError(
            "Applied diff paths differ from the accepted artifact.",
          );
        for (const path of actualPaths)
          await assertWorktreePathSafety(
            input.workspace,
            path,
            input.job.allowedPaths,
          );
        if (
          createHash("sha256").update(stagedDiff).digest("hex") !==
          input.job.sourceDiffHash
        )
          throw new WorktreePolicyError(
            "Staged diff changed after validation or review.",
          );
        if (unstaged)
          throw new WorktreePolicyError(
            "Tracked files changed outside the accepted staged artifact.",
          );
        await git.run([
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--cached",
          "--check",
          "HEAD",
          "--",
        ]);
        return stagedDiff;
      } finally {
        git.detachLock();
      }
    },
  );
}
