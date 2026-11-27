/**
 * @file services/ai-execution-worker/src/captureWorktreeDiff.service.ts
 * @version 1.1.0
 * @date 2026-11-27
 * @description Снимает ограниченный diff утверждённого worktree под общим lease, включая изменение индекса add -N.
 */
import { createHash } from "node:crypto";
import { Git, withGitRepositoryLock, type GitLock } from "@realize/git-runtime";
import { assertWorktreePathSafety } from "./assertWorktreePathSafety.validator";
import { WorktreePolicyError } from "./WorktreePolicy.error";
import type { WorktreeChangeScope, WorktreeDiff } from "./types";

const MAX_STORED_DIFF_BYTES = 256 * 1024;
const zeroSeparated = (value: string): string[] =>
  value.split("\0").filter(Boolean);

/** После reacquire заново проверяет HEAD и область до изменения индекса или выдачи evidence. */
export const captureWorktreeDiff = async (
  workspace: string,
  job: WorktreeChangeScope,
  existingLease?: GitLock,
): Promise<WorktreeDiff> =>
  withGitRepositoryLock(
    { repositoryRoot: workspace, existingLease },
    async (lease) => {
      const git = new Git(workspace, {
        profile: "service",
        maxOutputBytes: 4 * 1024 * 1024,
      });
      git.attachLock(lease);
      try {
        const [head, branch, tracked, untracked] = await Promise.all([
          git.run(["rev-parse", "HEAD"]),
          git.run(["symbolic-ref", "--quiet", "--short", "HEAD"], {
            acceptedExitCodes: [0, 1],
          }),
          git.run([
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--name-only",
            "-z",
            "HEAD",
            "--",
          ]),
          git.run(["ls-files", "--others", "--exclude-standard", "-z"]),
        ]);
        if (head.trim() !== job.baseCommit || branch.trim() !== job.branch)
          throw new WorktreePolicyError(
            "Worker changed Git HEAD or its bound branch.",
          );
        const untrackedPaths = zeroSeparated(untracked);
        const paths = [
          ...new Set([...zeroSeparated(tracked), ...untrackedPaths]),
        ].sort();
        if (!paths.length)
          throw new WorktreePolicyError(
            "Исполнитель завершил ответ без изменений файлов. Автоматические проверки не запускались. Изучите его пояснение и уточните план перед новым запуском.",
          );
        for (const path of paths)
          await assertWorktreePathSafety(
            workspace,
            path,
            job.allowedPaths,
            job.verifiedTemplateFiles,
          );
        if (untrackedPaths.length)
          await git.run(["add", "-N", "--", ...untrackedPaths]);
        try {
          await git.run([
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--check",
            "HEAD",
            "--",
          ]);
        } catch {
          throw new WorktreePolicyError(
            "git diff --check rejected the produced diff.",
          );
        }
        const fullDiff = await git.run([
          "diff",
          "--no-textconv",
          "--binary",
          "--no-ext-diff",
          "HEAD",
          "--",
        ]);
        const diffHash = createHash("sha256").update(fullDiff).digest("hex");
        const diffTruncated =
          Buffer.byteLength(fullDiff, "utf8") > MAX_STORED_DIFF_BYTES;
        const diff = diffTruncated
          ? Buffer.from(fullDiff)
              .subarray(0, MAX_STORED_DIFF_BYTES)
              .toString("utf8")
          : fullDiff;
        const numstat = await git.run([
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--numstat",
          "HEAD",
          "--",
        ]);
        const diffStat = numstat
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [additions, deletions, ...pathParts] = line.split("\t");
            return {
              ...(additions !== "-" ? { additions: Number(additions) } : {}),
              ...(deletions !== "-" ? { deletions: Number(deletions) } : {}),
              path: pathParts.join("\t"),
            };
          });
        return { changedPaths: paths, diff, diffHash, diffStat, diffTruncated };
      } finally {
        git.detachLock();
      }
    },
  );
