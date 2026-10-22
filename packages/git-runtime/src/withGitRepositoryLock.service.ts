/**
 * @file packages/git-runtime/src/withGitRepositoryLock.service.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Заимствует либо получает общий Git lease без повторной блокировки вложенных операций.
 */
import { realpath } from "node:fs/promises";
import { Git } from "./Git.adapter.ts";
import { acquireGitLock, assertGitLockHeld } from "./acquireGitLock.adapter.ts";
import { PolicyError } from "./Policy.error.ts";
import type { GitLock, GitRepositoryLockInput } from "./GitLock.types.ts";

/** Блокировка общая для всех worktree; borrowed lease освобождает только внешний владелец. */
export async function withGitRepositoryLock<T>(
  input: GitRepositoryLockInput,
  operation: (lease: GitLock) => Promise<T>,
): Promise<T> {
  const git = new Git(input.repositoryRoot, {
    profile: "machine-read",
    command: input.command,
  });
  const common = async () =>
    realpath(
      (
        await git.run(
          ["rev-parse", "--path-format=absolute", "--git-common-dir"],
          { signal: input.signal },
        )
      ).trimEnd(),
    );
  const directory = await common();
  const lease = input.existingLease ?? (await acquireGitLock(directory));
  try {
    assertGitLockHeld(lease);
    if (lease.commonDirectory !== directory || (await common()) !== directory)
      throw new PolicyError(
        "git_lock_repository_mismatch",
        "Git owner не совпадает с блокировкой операции.",
      );
    return await operation(lease);
  } finally {
    if (!input.existingLease) await lease.release();
  }
}
