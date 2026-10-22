/**
 * @file .ai/tools/git-delivery/src/merge/openGitMergeSource.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Удерживает общий Git lock и сверяет неизменённые local refs/checkout перед remote merge mutation.
 */
import { realpath } from "node:fs/promises";
import { Git } from "@realize/git-runtime";
import { GitJournalRepository } from "../GitJournal.repository.ts";
import { acquireGitLock } from "@realize/git-runtime";
import { assertGitManageClean } from "../manage/readGitManageState.adapter.ts";
import { PolicyError } from "@realize/git-runtime";
import type { GitLock } from "@realize/git-runtime";
import type { GitMergeContext, GitMergeLocalSource } from "./GitMerge.types.ts";

/** Порт читает Git metadata; не меняет local HEAD/index/worktree и не получает network credential. */
export async function openGitMergeSource(
  context: GitMergeContext,
): Promise<GitMergeLocalSource> {
  const git = new Git(context.repositoryRoot);
  let lock: GitLock | undefined;
  try {
    if (
      (await realpath(context.repositoryRoot)) !== context.repositoryRoot ||
      (
        await git.run(["rev-parse", "--show-toplevel"], { machineRead: true })
      ).trim() !== context.repositoryRoot
    )
      throw new PolicyError(
        "merge_repository_invalid",
        "Нужен canonical root назначенной рабочей копии.",
      );
    const directory = async (flag: string) =>
      realpath(
        (
          await git.run(["rev-parse", "--path-format=absolute", flag], {
            machineRead: true,
          })
        ).trim(),
      );
    const common = await directory("--git-common-dir");
    const gitDir = await directory("--git-dir");
    lock = await acquireGitLock(common);
    git.attachLock(lock);
    const storage = new GitJournalRepository(context);
    await git.run([
      "--no-literal-pathspecs",
      "check-ignore",
      "-q",
      "--",
      storage.relativePath,
    ]);
    return {
      storage,
      assertHeld: lock.assertHeld,
      close: () => lock!.release(),
      assertReady: async () => {
        if (
          (await directory("--git-common-dir")) !== common ||
          (await directory("--git-dir")) !== gitDir ||
          (
            await git.run(["symbolic-ref", "--quiet", "HEAD"], {
              machineRead: true,
            })
          ).trim() !== context.target.ref ||
          (
            await git.run(["rev-parse", "--verify", "HEAD^{commit}"], {
              machineRead: true,
            })
          ).trim() !== context.target.oid ||
          (
            await git.run(["rev-parse", "--verify", "HEAD^{tree}"], {
              machineRead: true,
            })
          ).trim() !== context.target.treeOid ||
          (
            await git.run(
              ["rev-parse", "--verify", `${context.source.ref}^{commit}`],
              { machineRead: true },
            )
          ).trim() !== context.source.oid
        )
          throw new PolicyError(
            "merge_local_source_changed",
            "Локальные refs или target tree изменились после проверки.",
          );
        await assertGitManageClean(git, gitDir);
      },
    };
  } catch (error) {
    await lock?.release().catch(() => {});
    throw error;
  }
}
