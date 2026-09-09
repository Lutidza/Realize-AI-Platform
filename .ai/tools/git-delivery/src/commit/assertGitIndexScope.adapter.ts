/**
 * @file .ai/tools/git-delivery/src/commit/assertGitIndexScope.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сверяет весь подготовленный индекс с областью commit.
 */
import { PolicyError } from "../Policy.error.ts";
import type { Git } from "../Git.adapter.ts";
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
