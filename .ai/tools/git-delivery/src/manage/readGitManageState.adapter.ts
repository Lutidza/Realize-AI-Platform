/**
 * @file .ai/tools/git-delivery/src/manage/readGitManageState.adapter.ts
 * @version 1.0.2
 * @date 2026-11-27
 * @description Читает HEAD и точные локальные цели для проверки управления и восстановления журнала.
 */
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { readStageFileState } from "./stageGitFile.adapter.ts";
import { basename, join, resolve } from "node:path";
import { Git } from "@realize/git-runtime";
import { PolicyError } from "@realize/git-runtime";
import { assertNoGitSecrets } from "../commit/assertNoGitSecrets.validator.ts";
import type { GitManageContext, GitManageState } from "./GitManage.types.ts";
import { parseGitManageURL } from "./parseGitManageURL.validator.ts";

export async function readGitManageHead(git: Git) {
  const head = (
    await git.run(["rev-parse", "--verify", "HEAD"], { machineRead: true })
  ).trim();
  const branchOutput = await git.run(
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    { machineRead: true, acceptedExitCodes: [0, 1] },
  );
  if (!/^[a-f0-9]{40}$/.test(head))
    throw new PolicyError(
      "manage_head_invalid",
      "Manage требует существующий SHA-1 HEAD.",
    );
  return { head, branch: branchOutput.trim() || null };
}

export async function readGitManageRemote(git: Git, remote: string) {
  const read = async (key: string) =>
    (
      await git.run(
        ["config", "--local", "--null", "--get-all", `remote.${remote}.${key}`],
        { acceptedExitCodes: [0, 1] },
      )
    )
      .split("\0")
      .filter(Boolean);
  const urls = await read("url");
  const pushURLs = await read("pushurl");
  if (!urls.length || urls.length > 16 || pushURLs.length > 16)
    throw new PolicyError(
      "manage_remote_invalid",
      "Remote отсутствует или имеет недопустимый набор URL.",
    );
  [...urls, ...pushURLs].forEach(parseGitManageURL);
  return { urls, pushURLs };
}

async function smallFile(path: string): Promise<string> {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  ).catch(() => {
    throw new PolicyError(
      "manage_worktree_invalid",
      "Метаданные worktree недоступны или содержат symlink.",
    );
  });
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 4096)
      throw new PolicyError(
        "manage_worktree_invalid",
        "Метаданные worktree недопустимы.",
      );
    const bytes = Buffer.alloc(4097);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 4096)
      throw new PolicyError(
        "manage_worktree_invalid",
        "Метаданные worktree превышают предел.",
      );
    assertNoGitSecrets(bytes.subarray(0, bytesRead));
    return new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(0, bytesRead),
    );
  } finally {
    await file.close();
  }
}

async function canonicalDirectory(path: string): Promise<boolean> {
  try {
    return (await realpath(path)) === path && (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Repair разрешён только для уже зарегистрированных внешних worktrees основной рабочей копии. */
export async function readGitManageWorktrees(
  context: GitManageContext,
  commonDir: string,
): Promise<string[]> {
  if (context.operation.kind !== "worktree-repair") return [];
  // Git repair main root обновляет все зарегистрированные links даже с явными path arguments.
  // Полный затрагиваемый набор должен быть отдельно разрешён caller до запуска команды.
  const registered = await readdir(join(commonDir, "worktrees"), {
    withFileTypes: true,
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw new PolicyError(
      "manage_worktree_invalid",
      "Регистрации worktree недоступны.",
    );
  });
  if (registered.length > 100)
    throw new PolicyError(
      "manage_worktree_scope_invalid",
      "Repair превышает разрешённое число worktrees.",
    );
  for (const entry of registered) {
    if (
      !entry.isDirectory() ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(entry.name)
    )
      throw new PolicyError(
        "manage_worktree_invalid",
        "Каталог регистрации worktree недопустим.",
      );
    const backPointer = await smallFile(
      join(commonDir, "worktrees", entry.name, "gitdir"),
    );
    const match = /^(\/[^\0\r\n]+)\/\.git\n$/.exec(backPointer);
    if (!match)
      throw new PolicyError(
        "manage_worktree_invalid",
        "Регистрация worktree повреждена.",
      );
    const exists = await lstat(match[1])
      .then(() => true)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw new PolicyError(
          "manage_worktree_invalid",
          "Зарегистрированный каталог worktree недоступен.",
        );
      });
    // Удалённый каталог не имеет файлов для mutation; его stale registration сохраняется без prune.
    if (exists && !context.operation.paths.includes(match[1]))
      throw new PolicyError(
        "manage_worktree_scope_invalid",
        "Repair требует явное разрешение всех существующих зарегистрированных внешних worktrees.",
      );
  }
  const targets: string[] = [];
  for (const path of context.operation.paths) {
    if (
      path === context.repositoryRoot ||
      path.startsWith(context.repositoryRoot + "/") ||
      !(await canonicalDirectory(path))
    )
      throw new PolicyError(
        "manage_worktree_invalid",
        "Нужен точный обычный каталог внешнего worktree.",
      );
    const pointer = await smallFile(join(path, ".git"));
    const match =
      /^gitdir: (\/[^\0\r\n]+\/worktrees\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99}))\n?$/.exec(
        pointer,
      );
    if (
      !match ||
      resolve(match[1]) !== match[1] ||
      basename(resolve(match[1], "..", "..")) !== basename(commonDir)
    )
      throw new PolicyError(
        "manage_worktree_invalid",
        "Связь worktree не соответствует репозиторию.",
      );
    const registration = join(commonDir, "worktrees", match[2]);
    const currentTarget = await realpath(match[1]).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw new PolicyError(
          "manage_worktree_invalid",
          "Текущая связь worktree недоступна.",
        );
      },
    );
    if (currentTarget !== null && currentTarget !== registration)
      throw new PolicyError(
        "manage_worktree_invalid",
        "Worktree уже связан с другим существующим репозиторием.",
      );
    if (!(await canonicalDirectory(registration)))
      throw new PolicyError(
        "manage_worktree_invalid",
        "Регистрация worktree недопустима.",
      );
    const backPointer = await smallFile(join(registration, "gitdir"));
    if (backPointer !== join(path, ".git") + "\n")
      throw new PolicyError(
        "manage_worktree_invalid",
        "Регистрация worktree не разрешает этот путь.",
      );
    targets.push(pointer, backPointer);
  }
  return targets;
}

export async function readGitManageState(
  git: Git,
  context: GitManageContext,
  commonDir: string,
): Promise<GitManageState> {
  const current = await readGitManageHead(git);
  let target: string[] = [];
  const operation = context.operation;
  if (operation.kind === "stage-file")
    target = await readStageFileState(git, operation);
  else if (operation.kind === "remote-set-url") {
    const remote = await readGitManageRemote(git, operation.remote);
    target = [JSON.stringify(remote.urls), JSON.stringify(remote.pushURLs)];
  } else if (
    operation.kind === "branch-create" ||
    operation.kind === "branch-switch"
  ) {
    const oid = (
      await git.run(
        ["rev-parse", "--verify", "--quiet", `refs/heads/${operation.name}`],
        { machineRead: true, acceptedExitCodes: [0, 1] },
      )
    ).trim();
    if (oid && !/^[a-f0-9]{40}$/.test(oid))
      throw new PolicyError(
        "manage_branch_invalid",
        "Целевая ветка недопустима.",
      );
    target = [oid];
  } else if (operation.kind === "worktree-repair")
    target = await readGitManageWorktrees(context, commonDir);
  return { ...current, target };
}

export async function assertGitManageClean(
  git: Git,
  gitDir: string,
): Promise<void> {
  const flags = await git.run(["ls-files", "-v", "-z"], { machineRead: true });
  if (
    flags
      .split("\0")
      .some((entry) => entry && (entry[0] === "S" || /^[a-z]$/.test(entry[0])))
  )
    throw new PolicyError(
      "manage_hidden_index_flags",
      "Перед сменой ветки снимите skip-worktree и assume-unchanged для проверяемого индекса.",
    );
  if (
    await git.run(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  )
    throw new PolicyError(
      "manage_dirty_repository",
      "Переключение и создание веток требуют чистый индекс и рабочие файлы.",
    );
  for (const marker of [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "REBASE_HEAD",
    "sequencer",
    "rebase-merge",
    "rebase-apply",
    "BISECT_LOG",
  ]) {
    const exists = await lstat(join(gitDir, marker))
      .then(() => true)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw error;
      });
    if (exists)
      throw new PolicyError(
        "manage_operation_in_progress",
        "Сначала завершите текущую операцию Git.",
      );
  }
}
