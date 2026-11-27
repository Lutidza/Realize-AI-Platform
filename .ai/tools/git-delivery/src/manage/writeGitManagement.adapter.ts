/**
 * @file .ai/tools/git-delivery/src/manage/writeGitManagement.adapter.ts
 * @version 1.0.2
 * @date 2026-11-27
 * @description Вычисляет точные переходы локального Git и исполняет только разрешённую mutation.
 */
import { writeStageFile } from "./stageGitFile.adapter.ts";
import { join } from "node:path";
import { Git } from "@realize/git-runtime";
import { PolicyError } from "@realize/git-runtime";
import type { GitManageContext, GitManageState } from "./GitManage.types.ts";
import { parseGitManageURL } from "./parseGitManageURL.validator.ts";

/** After выводится из before и context, чтобы изменённый журнал не назначал новые цели. */
export function expectedGitManageAfter(
  context: GitManageContext,
  before: GitManageState,
  commonDir: string,
): GitManageState {
  const operation = context.operation;
  const after: GitManageState = { ...before, target: [...before.target] };
  if (operation.kind === "stage-file") {
    if (before.target.length !== 3)
      throw new PolicyError("invalid_journal", "Неполный снимок индекса.");
    after.target[0] = before.target[2];
  } else if (operation.kind === "remote-set-url") {
    let urls: unknown;
    let pushURLs: unknown;
    try {
      urls = JSON.parse(before.target[0]);
      pushURLs = JSON.parse(before.target[1]);
    } catch {
      throw new PolicyError(
        "manage_remote_invalid",
        "Метаданные remote повреждены.",
      );
    }
    if (
      !Array.isArray(urls) ||
      urls.length !== 1 ||
      urls[0] !== operation.expectedURL ||
      !Array.isArray(pushURLs) ||
      pushURLs.length > 16
    )
      throw new PolicyError(
        "manage_remote_changed",
        "Текущий remote не совпадает с разрешённым expectedURL.",
      );
    const next = parseGitManageURL(operation.url);
    for (const url of pushURLs) {
      const push = parseGitManageURL(url);
      if (push.owner !== next.owner || push.repository !== next.repository)
        throw new PolicyError(
          "manage_push_url_conflict",
          "Отдельный pushurl требует собственного явного разрешения на изменение.",
        );
    }
    after.target = [JSON.stringify([operation.url]), before.target[1]];
  } else if (operation.kind === "branch-create") {
    if (before.target.length !== 1 || before.target[0])
      throw new PolicyError(
        "manage_branch_exists",
        "Целевая ветка уже существует.",
      );
    after.target = [before.head];
    if (operation.switch) after.branch = operation.name;
  } else if (operation.kind === "branch-switch") {
    if (before.target.length !== 1 || !/^[a-f0-9]{40}$/.test(before.target[0]))
      throw new PolicyError(
        "manage_branch_missing",
        "Целевая локальная ветка отсутствует.",
      );
    after.head = before.target[0];
    after.branch = operation.name;
  } else if (operation.kind === "worktree-repair") {
    if (before.target.length !== operation.paths.length * 2)
      throw new PolicyError(
        "manage_worktree_invalid",
        "Метаданные repair повреждены.",
      );
    after.target = before.target.map((value, index) => {
      if (index % 2) {
        if (value !== join(operation.paths[(index - 1) / 2], ".git") + "\n")
          throw new PolicyError(
            "manage_worktree_invalid",
            "Repair выходит за разрешённые пути.",
          );
        return value;
      }
      const match =
        /^gitdir: \/[^\0\r\n]+\/worktrees\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99})\n?$/.exec(
          value,
        );
      if (!match)
        throw new PolicyError(
          "manage_worktree_invalid",
          "Метаданные repair повреждены.",
        );
      return `gitdir: ${join(commonDir, "worktrees", match[1])}\n`;
    });
  }
  return after;
}

/** URL CAS использует exact regex; branch switch отключает post-checkout hooks и recurse-submodules. */
export async function writeGitManagement(
  git: Git,
  context: GitManageContext,
  expectedAfter: GitManageState,
): Promise<void> {
  const operation = context.operation;
  switch (operation.kind) {
    case "stage-file":
      return writeStageFile(git, operation, expectedAfter.target);
    case "remote-set-url": {
      const exact =
        "^" +
        operation.expectedURL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "$";
      await git.run([
        "remote",
        "set-url",
        operation.remote,
        operation.url,
        exact,
      ]);
      break;
    }
    case "worktree-repair":
      await git.run(["worktree", "repair", "--", ...operation.paths]);
      break;
    case "branch-create":
      if (operation.switch)
        await git.run([
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "submodule.recurse=false",
          "switch",
          "--no-guess",
          "--no-recurse-submodules",
          "--no-overwrite-ignore",
          "--create",
          operation.name,
          context.expected!.head,
        ]);
      else
        await git.run(["branch", "--", operation.name, context.expected!.head]);
      break;
    case "branch-switch":
      await git.run([
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "submodule.recurse=false",
        "switch",
        "--no-guess",
        "--no-recurse-submodules",
        "--no-overwrite-ignore",
        "--",
        operation.name,
      ]);
      break;
    default:
      throw new PolicyError(
        "manage_write_invalid",
        "Операция не разрешает изменение Git.",
      );
  }
}
