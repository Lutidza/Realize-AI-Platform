/**
 * @file services/ai-execution-worker/src/workspaceDependencies.ts
 * @owner services/ai-execution-worker
 * @purpose Materializes trusted dependencies for isolated validation worktrees.
 */

import { constants } from "node:fs";
import { cp, lstat, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";

const dependencyTarget = async (workspace: string): Promise<string> => {
  const workspaceRoot = resolve(workspace);
  const stats = await lstat(workspaceRoot);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("Validation workspace must be a real directory.");
  }
  const target = resolve(workspaceRoot, "node_modules");
  if (relative(workspaceRoot, target) !== "node_modules") {
    throw new Error("Dependency target escaped the validation workspace.");
  }
  return target;
};

/** Copies installed dependencies into a real worktree-local directory. */
export const materializeWorkspaceDependencies = async (
  repositoryRoot: string,
  workspace: string,
): Promise<void> => {
  const source = resolve(repositoryRoot, "node_modules");
  const target = await dependencyTarget(workspace);
  if (source === target) {
    throw new Error("Repository and validation dependency roots must differ.");
  }
  const stats = await lstat(source);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("Repository node_modules is unavailable for checks.");
  }

  await rm(target, { force: true, recursive: true });
  try {
    await cp(source, target, {
      errorOnExist: true,
      force: false,
      mode: constants.COPYFILE_FICLONE,
      recursive: true,
      verbatimSymlinks: true,
    });
    const copied = await lstat(target);
    if (!copied.isDirectory() || copied.isSymbolicLink()) {
      throw new Error("Materialized node_modules is not a real directory.");
    }
  } catch (error) {
    try {
      await rm(target, { force: true, recursive: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Dependency materialization and cleanup both failed.",
      );
    }
    throw error;
  }
};

/** Removes only the worktree-local dependency materialization. */
export const removeWorkspaceDependencies = async (
  workspace: string,
): Promise<void> => {
  await rm(await dependencyTarget(workspace), {
    force: true,
    recursive: true,
  });
};

/** Makes trusted dependencies available only for the bounded check phase. */
export const withWorkspaceDependencies = async <T>(
  repositoryRoot: string,
  workspace: string,
  operation: () => Promise<T>,
): Promise<T> => {
  await materializeWorkspaceDependencies(repositoryRoot, workspace);
  try {
    return await operation();
  } finally {
    await removeWorkspaceDependencies(workspace);
  }
};
