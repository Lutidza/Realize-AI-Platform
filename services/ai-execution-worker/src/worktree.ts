/**
 * @file services/ai-execution-worker/src/worktree.ts
 * @version 1.1.1
 * @date 2026-10-22
 * @description Создаёт привязанный к утверждённому commit изолированный worktree под общим Git lease.
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
import { Git, withGitRepositoryLock } from "@realize/git-runtime";
import { mkdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { WorktreePolicyError } from "./WorktreePolicy.error";
import type {
  CreateBoundWorktreeInput,
  CreateExecutionWorktreeInput,
} from "./WorkerWorktree.types";

const isInside = (owner: string, candidate: string): boolean => {
  const path = relative(owner, candidate);
  return path === "" || (!path.startsWith(".." + sep) && path !== "..");
};

/** Привязывает execution job к серверным namespace и отдельному worktree. */
export const createExecutionWorktree = async (
  input: CreateExecutionWorktreeInput,
): Promise<string> =>
  createBoundWorktree({
    baseCommit: input.job.baseCommit,
    branch: input.job.branch,
    repositoryRoot: input.repositoryRoot,
    workspaceID: input.job.workspaceID,
    workspaceRoot: input.workspaceRoot,
    existingLease: input.existingLease,
  });

/** Создание и rollback занимают одну короткую фазу; модель запускается после освобождения lease. */
export const createBoundWorktree = async (
  input: CreateBoundWorktreeInput,
): Promise<string> => {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.baseCommit))
    throw new WorktreePolicyError("Base commit identity is invalid.");
  if (!/^ai\/(?:change|preview)-[a-z0-9-]{8,64}$/.test(input.branch))
    throw new WorktreePolicyError("Worker branch identity is invalid.");
  const repositoryRoot = resolve(input.repositoryRoot);
  const workspaceRoot = resolve(input.workspaceRoot);
  if (
    isInside(repositoryRoot, workspaceRoot) ||
    isInside(workspaceRoot, repositoryRoot)
  )
    throw new WorktreePolicyError(
      "Execution workspace root must be outside the repository checkout.",
    );
  if (!/^[a-z0-9-]{8,80}$/.test(input.workspaceID))
    throw new WorktreePolicyError("Workspace ID is invalid.");
  await mkdir(workspaceRoot, { mode: 0o700, recursive: true });
  const target = resolve(workspaceRoot, input.workspaceID);
  if (!isInside(workspaceRoot, target) || target === workspaceRoot)
    throw new WorktreePolicyError("Resolved workspace escaped its owner root.");

  return withGitRepositoryLock(
    { repositoryRoot, existingLease: input.existingLease },
    async (lease) => {
      const repository = new Git(repositoryRoot, { profile: "service" });
      const worktree = new Git(target, { profile: "service" });
      repository.attachLock(lease);
      worktree.attachLock(lease);
      let createdWorktree = false;
      let createdBranch = false;
      try {
        const base = (
          await repository.run([
            "rev-parse",
            "--verify",
            input.baseCommit + "^{commit}",
          ])
        ).trim();
        if (base !== input.baseCommit)
          throw new WorktreePolicyError("Approved base commit is unavailable.");
        await repository.run([
          "worktree",
          "add",
          "--detach",
          target,
          input.baseCommit,
        ]);
        createdWorktree = true;
        await worktree.run(["switch", "-c", input.branch]);
        createdBranch = true;
        const [topLevel, head] = await Promise.all([
          worktree.run(["rev-parse", "--show-toplevel"]),
          worktree.run(["rev-parse", "HEAD"]),
        ]);
        if (
          resolve(topLevel.trim()) !== target ||
          head.trim() !== input.baseCommit
        )
          throw new WorktreePolicyError(
            "Created worktree does not match the bound commit.",
          );
        return target;
      } catch (error) {
        const failures: unknown[] = [error];
        if (createdWorktree) {
          try {
            await repository.run(["worktree", "remove", "--force", target]);
          } catch (cleanupError) {
            failures.push(cleanupError);
          }
        }
        if (createdBranch) {
          try {
            await repository.run(["branch", "-D", "--", input.branch]);
          } catch (cleanupError) {
            failures.push(cleanupError);
          }
        }
        if (failures.length > 1)
          throw new AggregateError(
            failures,
            "Worktree creation and cleanup both failed.",
          );
        throw error;
      } finally {
        worktree.detachLock();
        repository.detachLock();
      }
    },
  );
};
