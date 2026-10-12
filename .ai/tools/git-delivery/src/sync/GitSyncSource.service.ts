/**
 * @file .ai/tools/git-delivery/src/sync/GitSyncSource.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет неизменённые HEAD, ветку, полную историю и чистую рабочую копию перед синхронизацией.
 */

import { lstat } from "node:fs/promises";
import type { Git } from "../Git.adapter.ts";
import { PolicyError } from "../Policy.error.ts";
import type { GitSyncContext } from "./GitSync.types.ts";

/** Повторные проверки не изменяют refs, индекс или файлы и исключают скрытые операции Git. */
export class GitSyncSourceService {
  constructor(
    private readonly git: Git,
    private readonly context: GitSyncContext,
  ) {}

  async assertReady(
    expectedHead = this.context.target.sourceOid,
  ): Promise<void> {
    await this.assertCompleteHistory();
    const branch = (
      await this.git.run(["symbolic-ref", "--quiet", "HEAD"], {
        machineRead: true,
      })
    ).trim();
    const head = (
      await this.git.run(["rev-parse", "--verify", "HEAD^{commit}"], {
        machineRead: true,
      })
    ).trim();
    if (
      branch !== `refs/heads/${this.context.target.branch}` ||
      head !== expectedHead
    )
      throw new PolicyError(
        "sync_source_changed",
        "HEAD или ветка отличаются от назначенного состояния.",
      );
    await this.assertNoOperation();
    if (this.context.authorization.actions[0] === "pull")
      await this.assertClean();
  }

  async readHead(): Promise<string> {
    return (
      await this.git.run(["rev-parse", "--verify", "HEAD^{commit}"], {
        machineRead: true,
      })
    ).trim();
  }

  async assertFastForward(): Promise<void> {
    try {
      await this.git.run([
        "--no-replace-objects",
        "merge-base",
        "--is-ancestor",
        this.context.target.sourceOid,
        this.context.target.remoteOid,
      ]);
    } catch {
      throw new PolicyError(
        "pull_not_fast_forward",
        "Назначенная версия не является fast-forward текущего HEAD.",
      );
    }
  }

  /** Pull не меняет checkout подмодулей и отклоняет gitlinks до применения входящего дерева. */
  async assertNoIncomingGitlinks(): Promise<void> {
    const tree = await this.git.run(
      ["ls-tree", "-r", "--full-tree", "-z", this.context.target.remoteOid],
      { machineRead: true },
    );
    if (tree.split("\0").some((entry) => entry.startsWith("160000 ")))
      throw new PolicyError(
        "pull_submodules_unsupported",
        "Pull не поддерживает входящие gitlinks без отдельного контракта подмодулей.",
      );
  }

  private async assertClean(): Promise<void> {
    const entries = await this.git.run(["ls-files", "--stage", "-z"], {
      machineRead: true,
    });
    if (entries.split("\0").some((entry) => entry.startsWith("160000 ")))
      throw new PolicyError(
        "pull_submodules_unsupported",
        "Pull не поддерживает checkout с gitlinks без отдельного контракта подмодулей.",
      );
    const status = await this.git.run([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--ignore-submodules=none",
      "--no-renames",
    ]);
    if (status.length)
      throw new PolicyError(
        "pull_worktree_dirty",
        "Pull требует чистых индекса, рабочей копии и untracked-файлов.",
      );
    // skip-worktree и assume-unchanged могут скрыть изменённые tracked-файлы от status.
    const flags = await this.git.run(["ls-files", "-v", "-z"], {
      machineRead: true,
    });
    if (flags.split("\0").some((entry) => entry && /^[a-zS]/.test(entry)))
      throw new PolicyError(
        "pull_index_flags_unsupported",
        "Pull не допускает скрывающие изменения флаги индекса.",
      );
  }

  private async assertCompleteHistory(): Promise<void> {
    const replacements = await this.git.run([
      "for-each-ref",
      "--format=%(refname)",
      "refs/replace/",
    ]);
    const shallow = (
      await this.git.run(["rev-parse", "--is-shallow-repository"], {
        machineRead: true,
      })
    ).trim();
    const grafts = await this.pathExists("info/grafts");
    if (replacements.trim() || shallow !== "false" || grafts)
      throw new PolicyError(
        "sync_history_unsupported",
        "Синхронизация требует полной истории без replace refs, grafts и shallow-границ.",
      );
    try {
      const promisor = await this.git.run([
        "config",
        "--get-regexp",
        "^remote\\..*\\.promisor$",
      ]);
      if (promisor.trim())
        throw new PolicyError(
          "sync_history_unsupported",
          "Синхронизация не допускает partial clone с неявной сетью.",
        );
    } catch (error) {
      if (error instanceof PolicyError) throw error;
      if (!(
        error &&
        typeof error === "object" &&
        "exitCode" in error &&
        error.exitCode === 1
      ))
        throw error;
    }
  }

  private async assertNoOperation(): Promise<void> {
    for (const name of [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "REBASE_HEAD",
      "rebase-merge",
      "rebase-apply",
      "sequencer",
      "BISECT_LOG",
    ]) {
      if (await this.pathExists(name))
        throw new PolicyError(
          "sync_operation_in_progress",
          "В рабочей копии уже выполняется операция Git.",
        );
    }
  }

  private async pathExists(name: string): Promise<boolean> {
    const path = (
      await this.git.run(
        ["rev-parse", "--path-format=absolute", "--git-path", name],
        { machineRead: true },
      )
    ).trim();
    return await lstat(path).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw error;
      },
    );
  }
}
