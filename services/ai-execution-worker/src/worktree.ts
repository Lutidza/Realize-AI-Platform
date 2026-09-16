/**
 * @file services/ai-execution-worker/src/worktree.ts
 * @version 1.1.0
 * @date 2026-09-15
 * @description Создаёт изолированные Git worktree и проверяет область полученных изменений.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { pathMatchesExecutionScope } from "@realize/change-engine";

import type { ClaimedExecutionJob, WorktreeDiff } from "./types";

const execute = promisify(execFile);
const MAX_STORED_DIFF_BYTES = 256 * 1024;

/** Expected policy failure that must block rather than retry a job. */
export class WorktreePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreePolicyError";
  }
}

export const runGit = async (cwd: string, args: string[]): Promise<string> => {
  const result = await execute("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return result.stdout;
};

const isInside = (owner: string, candidate: string): boolean => {
  const path = relative(owner, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
};

const assertGitIdentity = (baseCommit: string, branch: string): void => {
  if (!/^[a-f0-9]{40,64}$/.test(baseCommit)) {
    throw new WorktreePolicyError("Base commit identity is invalid.");
  }
  if (!/^ai\/(?:change|preview)-[a-z0-9-]{8,64}$/.test(branch)) {
    throw new WorktreePolicyError("Worker branch identity is invalid.");
  }
};

/** Creates a new branch worktree outside the active source checkout. */
export const createExecutionWorktree = async (input: {
  job: ClaimedExecutionJob;
  repositoryRoot: string;
  workspaceRoot: string;
}): Promise<string> => {
  return await createBoundWorktree({
    baseCommit: input.job.baseCommit,
    branch: input.job.branch,
    repositoryRoot: input.repositoryRoot,
    workspaceID: input.job.workspaceID,
    workspaceRoot: input.workspaceRoot,
  });
};

/** Creates a validated detached worktree for an exact commit and branch. */
export const createBoundWorktree = async (input: {
  baseCommit: string;
  branch: string;
  repositoryRoot: string;
  workspaceID: string;
  workspaceRoot: string;
}): Promise<string> => {
  assertGitIdentity(input.baseCommit, input.branch);
  const repositoryRoot = resolve(input.repositoryRoot);
  const workspaceRoot = resolve(input.workspaceRoot);
  if (
    isInside(repositoryRoot, workspaceRoot) ||
    isInside(workspaceRoot, repositoryRoot)
  ) {
    throw new WorktreePolicyError(
      "Execution workspace root must be outside the repository checkout.",
    );
  }
  if (!/^[a-z0-9-]{8,80}$/.test(input.workspaceID)) {
    throw new WorktreePolicyError("Workspace ID is invalid.");
  }
  await mkdir(workspaceRoot, { mode: 0o700, recursive: true });
  const target = resolve(workspaceRoot, input.workspaceID);
  if (!isInside(workspaceRoot, target) || target === workspaceRoot) {
    throw new WorktreePolicyError("Resolved workspace escaped its owner root.");
  }

  let createdWorktree = false;
  let createdBranch = false;
  try {
    await runGit(repositoryRoot, [
      "worktree",
      "add",
      "--detach",
      target,
      input.baseCommit,
    ]);
    createdWorktree = true;
    await runGit(target, ["switch", "-c", input.branch]);
    createdBranch = true;
    const [topLevel, head] = await Promise.all([
      runGit(target, ["rev-parse", "--show-toplevel"]),
      runGit(target, ["rev-parse", "HEAD"]),
    ]);
    if (
      resolve(topLevel.trim()) !== target ||
      head.trim() !== input.baseCommit
    ) {
      throw new WorktreePolicyError(
        "Created worktree does not match the bound commit.",
      );
    }
    return target;
  } catch (error) {
    const failures: unknown[] = [error];
    if (createdWorktree) {
      try {
        await runGit(repositoryRoot, ["worktree", "remove", "--force", target]);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
    if (createdBranch) {
      try {
        await runGit(repositoryRoot, ["branch", "-D", "--", input.branch]);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
    if (failures.length > 1) {
      throw new AggregateError(
        failures,
        "Worktree creation and cleanup both failed.",
      );
    }
    throw error;
  }
};

const zeroSeparated = (value: string): string[] =>
  value.split("\0").filter(Boolean);

const changedPaths = async (workspace: string): Promise<string[]> => {
  const [tracked, untracked] = await Promise.all([
    runGit(workspace, ["diff", "--name-only", "-z", "HEAD", "--"]),
    runGit(workspace, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const untrackedPaths = zeroSeparated(untracked);
  if (untrackedPaths.length > 0) {
    await runGit(workspace, ["add", "-N", "--", ...untrackedPaths]);
  }
  return [...new Set([...zeroSeparated(tracked), ...untrackedPaths])].sort();
};

const assertPathSafety = async (
  workspace: string,
  path: string,
  allowedPaths: string[],
): Promise<void> => {
  if (
    path.startsWith("/") ||
    path.includes("\0") ||
    path.split("/").includes("..") ||
    !pathMatchesExecutionScope(path, allowedPaths)
  ) {
    throw new WorktreePolicyError(`Worker changed a forbidden path: ${path}`);
  }
  try {
    const stats = await lstat(resolve(workspace, path));
    if (stats.isSymbolicLink()) {
      throw new WorktreePolicyError(`Worker created a symbolic link: ${path}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

/** Captures a bounded unified diff only after enforcing commit and path scope. */
export const captureWorktreeDiff = async (
  workspace: string,
  job: ClaimedExecutionJob,
): Promise<WorktreeDiff> => {
  const head = (await runGit(workspace, ["rev-parse", "HEAD"])).trim();
  if (head !== job.baseCommit) {
    throw new WorktreePolicyError(
      "Worker changed Git HEAD or created a commit.",
    );
  }
  const paths = await changedPaths(workspace);
  if (paths.length === 0) {
    throw new WorktreePolicyError(
      "Исполнитель завершил ответ без изменений файлов. Автоматические проверки не запускались. Изучите его пояснение и уточните план перед новым запуском.",
    );
  }
  for (const path of paths) {
    await assertPathSafety(workspace, path, job.allowedPaths);
  }

  try {
    await runGit(workspace, ["diff", "--check", "HEAD", "--"]);
  } catch {
    throw new WorktreePolicyError(
      "git diff --check rejected the produced diff.",
    );
  }
  const fullDiff = await runGit(workspace, [
    "diff",
    "--binary",
    "--no-ext-diff",
    "HEAD",
    "--",
  ]);
  const diffHash = createHash("sha256").update(fullDiff).digest("hex");
  const bytes = Buffer.byteLength(fullDiff, "utf8");
  const diffTruncated = bytes > MAX_STORED_DIFF_BYTES;
  const diff = diffTruncated
    ? Buffer.from(fullDiff).subarray(0, MAX_STORED_DIFF_BYTES).toString("utf8")
    : fullDiff;
  const numstat = await runGit(workspace, ["diff", "--numstat", "HEAD", "--"]);
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
};
