/**
 * @file services/ai-execution-worker/src/removePromotionWorktree.service.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Удаляет только серверный preview worktree и его ветку под общим Git lease.
 */
import { lstat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { Git, withGitRepositoryLock } from "@realize/git-runtime";
import { WorktreePolicyError } from "./WorktreePolicy.error";
import type { RemovePromotionWorktreeInput } from "./WorkerWorktree.types";

/** Cleanup выполняется после остановки runtime и вне операций с БД; branch namespace проверяется до удаления. */
export const removePromotionWorktree = async (
  input: RemovePromotionWorktreeInput,
): Promise<void> => {
  if (!/^[a-z0-9-]{8,80}$/.test(input.workspaceID))
    throw new WorktreePolicyError("Cleanup workspace ID is invalid.");
  if (input.branch && !/^ai\/preview-[a-z0-9-]{8,64}$/.test(input.branch))
    throw new WorktreePolicyError("Cleanup branch identity is invalid.");
  const root = resolve(input.workspaceRoot);
  const target = resolve(root, input.workspaceID);
  const path = relative(root, target);
  if (!path || path === ".." || path.startsWith(".." + sep))
    throw new WorktreePolicyError("Cleanup workspace escaped its owner root.");

  await withGitRepositoryLock(
    {
      repositoryRoot: input.repositoryRoot,
      existingLease: input.existingLease,
    },
    async (lease) => {
      const git = new Git(input.repositoryRoot, { profile: "service" });
      git.attachLock(lease);
      try {
        const records = (
          await git.run(["worktree", "list", "--porcelain", "-z"])
        ).split("\0");
        const index = records.indexOf("worktree " + target);
        if (index >= 0 && input.branch) {
          const end = records.findIndex(
            (record, i) => i > index && record.startsWith("worktree "),
          );
          const own = records.slice(index, end < 0 ? undefined : end);
          if (!own.includes("branch refs/heads/" + input.branch))
            throw new WorktreePolicyError(
              "Cleanup worktree no longer belongs to the expected branch.",
            );
        }
        let targetExists = true;
        try {
          await lstat(target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          targetExists = false;
        }
        if (index >= 0) {
          // Git удаляет запись exact worktree даже при отсутствующем каталоге; чужие записи не prune-ятся.
          await git.run(["worktree", "remove", "--force", target]);
        } else if (targetExists)
          throw new WorktreePolicyError(
            "Cleanup target is not a registered worktree.",
          );
        if (input.branch) {
          const reference = "refs/heads/" + input.branch;
          const existing = await git.run([
            "for-each-ref",
            "--format=%(refname)",
            reference,
          ]);
          if (existing.trim() === reference)
            await git.run(["branch", "-D", "--", input.branch]);
        }
      } finally {
        git.detachLock();
      }
    },
  );
};
