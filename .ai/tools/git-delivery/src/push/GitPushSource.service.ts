/**
 * @file .ai/tools/git-delivery/src/push/GitPushSource.service.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет локальный источник push и точное разрешение на его неизменённую полную историю.
 */
import { PolicyError } from "@realize/git-runtime";

import { lstat } from "node:fs/promises";

import type { Git } from "@realize/git-runtime";
import type { GitPushContext } from "./GitPush.types.ts";

/**
 * Проверяет прикладные условия публикации через Git adapter без изменения рабочей копии.
 * @see documentation/architecture/decisions/ADR-0016-development-git-delivery-handler.md
 */
export class GitPushSourceService {
  private readonly git: Git;
  private readonly context: GitPushContext;

  constructor(git: Git, context: GitPushContext) {
    this.git = git;
    this.context = context;
  }

  /** До сети сверяет HEAD, ветку и каждый исходящий commit с разрешённым набором. */
  async assertReady(): Promise<void> {
    await this.recheck();
    await this.assertAuthorizedHistory();
    await this.assertCompleteHistory();
  }

  /** Перед записью повторяет изменяемые локальные условия; OID исходного графа закреплён разрешением. */
  async recheck(): Promise<void> {
    await this.assertCompleteHistory();
    const branch = (
      await this.git.run(["symbolic-ref", "--quiet", "HEAD"])
    ).trim();
    const head = (
      await this.git.run([
        "--no-replace-objects",
        "rev-parse",
        "--verify",
        "HEAD^{commit}",
      ])
    ).trim();
    if (
      branch !== `refs/heads/${this.context.target.branch}` ||
      head !== this.context.target.sourceOid
    ) {
      throw new PolicyError(
        "push_source_changed",
        "Ветка или HEAD не соответствуют разрешённому commit.",
      );
    }
  }

  private async assertAuthorizedHistory(): Promise<void> {
    const { sourceOid, remoteOid, branch } = this.context.target;
    await this.git.run(["check-ref-format", `refs/heads/${branch}`]);
    if (remoteOid) {
      try {
        await this.git.run([
          "--no-replace-objects",
          "merge-base",
          "--is-ancestor",
          remoteOid,
          sourceOid,
        ]);
      } catch {
        throw new PolicyError(
          "push_not_fast_forward",
          "Разрешённая удалённая версия не является известным предком commit.",
        );
      }
    }
    // Даже появившаяся между проверками replacement ref не должна скрыть исходящие объекты.
    const output = await this.git.run([
      "--no-replace-objects",
      "rev-list",
      "--max-count=2049",
      sourceOid,
      ...(remoteOid ? ["--not", remoteOid] : []),
      "--",
    ]);
    const commits = output.trim() ? output.trim().split("\n") : [];
    const allowed = new Set(this.context.authorization.scope.commits);
    if (
      commits.length !== allowed.size ||
      commits.some((commit) => !allowed.has(commit))
    ) {
      throw new PolicyError(
        "push_scope_mismatch",
        "Разрешение не покрывает точный публикуемый набор коммитов.",
      );
    }
  }

  private async assertCompleteHistory(): Promise<void> {
    // replace, grafts и shallow меняют обход родителей без изменения source OID.
    const replacements = await this.git.run([
      "for-each-ref",
      "--format=%(refname)",
      "refs/replace/",
    ]);
    const shallow = (
      await this.git.run(["rev-parse", "--is-shallow-repository"])
    ).trim();
    const graftsPath = (
      await this.git.run([
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "info/grafts",
      ])
    ).trim();
    const grafts = await lstat(graftsPath).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (replacements.trim() || shallow !== "false" || grafts !== null) {
      throw new PolicyError(
        "push_history_unsupported",
        "Push требует полной истории без replace refs, grafts и shallow-границ.",
      );
    }
  }
}
