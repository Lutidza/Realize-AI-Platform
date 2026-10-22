/**
 * @file .ai/tools/git-delivery/src/commit/assertGitIndexScope.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Сверяет весь подготовленный индекс с областью commit.
 */
import { PolicyError } from "@realize/git-runtime";
import type { Git } from "@realize/git-runtime";
import { stagedPaths } from "../repository.ts";

export async function assertIndexScope(
  git: Git,
  paths: string[],
  exact = false,
): Promise<void> {
  const staged = await stagedPaths(git);
  const allowed = new Set(paths);
  if (
    staged.some((path) => !allowed.has(path)) ||
    (exact && staged.length !== paths.length)
  ) {
    throw new PolicyError(
      "foreign_index",
      "Индекс содержит другой состав; чужие изменения сохранены.",
    );
  }
}
