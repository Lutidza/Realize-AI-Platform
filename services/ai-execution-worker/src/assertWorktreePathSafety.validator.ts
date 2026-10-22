/**
 * @file services/ai-execution-worker/src/assertWorktreePathSafety.validator.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет, что изменённый путь принадлежит утверждённой области и не является ссылкой.
 */
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathMatchesExecutionScope } from "@realize/change-engine";
import { WorktreePolicyError } from "./WorktreePolicy.error";

/** Удалённый файл допустим; существующий путь обязан оставаться в утверждённой области. */
export async function assertWorktreePathSafety(
  workspace: string,
  path: string,
  allowedPaths: string[],
): Promise<void> {
  if (
    path.startsWith("/") ||
    path.includes("\0") ||
    path.split("/").includes("..") ||
    !pathMatchesExecutionScope(path, allowedPaths)
  ) {
    throw new WorktreePolicyError(
      `Worktree contains a forbidden path: ${path}`,
    );
  }
  try {
    const stats = await lstat(resolve(workspace, path));
    if (stats.isSymbolicLink()) {
      throw new WorktreePolicyError(
        `Worktree contains a symbolic link: ${path}`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
