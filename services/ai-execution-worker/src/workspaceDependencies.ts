/**
 * @file services/ai-execution-worker/src/workspaceDependencies.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Управляет временем жизни подтверждённой копии зависимостей изолированного worktree.
 */

import { lstat, rm } from "node:fs/promises";
import {
  materializeVerificationDependencies,
  type VerificationDependencyLease,
} from "@realize/verification-runtime";
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

/** Общий runtime копирует зависимости и выдаёт непрозрачное подтверждение этой копии. */
export const materializeWorkspaceDependencies = async (
  repositoryRoot: string,
  workspace: string,
): Promise<VerificationDependencyLease> =>
  materializeVerificationDependencies(repositoryRoot, workspace);

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
  operation: (lease: VerificationDependencyLease) => Promise<T>,
): Promise<T> => {
  const lease = await materializeWorkspaceDependencies(
    repositoryRoot,
    workspace,
  );
  try {
    return await operation(lease);
  } finally {
    await removeWorkspaceDependencies(workspace);
  }
};
