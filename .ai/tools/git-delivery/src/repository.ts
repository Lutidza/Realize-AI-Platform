/**
 * @file .ai/tools/git-delivery/src/repository.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Снимок связывает Git, байты индекса и разрешённые файлы без staging и чтения через symlink.
 */

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { Git, GitFailure } from "./Git.adapter.ts";

const MAX_PATHS = 10_000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_INDEX_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const DIRECTORY_FLAGS =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const FILE_FLAGS =
  constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

export type { Change, FileState, Snapshot } from "./GitSnapshot.types.ts";
import type {
  Change,
  FileState,
  Snapshot,
  GitContentValidator,
  GitSnapshotReadBudget,
} from "./GitSnapshot.types.ts";
import { PolicyError } from "./Policy.error.ts";
import type { Scope } from "./GitDelivery.types.ts";

const hash = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
const missingHash = hash(JSON.stringify(["missing"]));
const pathOrder = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const filesystemCode = (error: unknown): string | undefined =>
  error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;

function assertPath(path: string): void {
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\0") ||
    isAbsolute(path) ||
    /^[A-Za-z]:[\\/]/u.test(path) ||
    path
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git",
      )
  ) {
    throw new GitFailure(
      "repository_path_invalid",
      "Недопустимый путь в области чтения.",
    );
  }
}

function nulRecords(value: string): string[] {
  if (!value) return [];
  if (!value.endsWith("\0")) {
    throw new GitFailure(
      "git_output_invalid",
      "Git вернул неполный список путей.",
    );
  }
  const records = value.slice(0, -1).split("\0");
  if (records.length > MAX_PATHS) {
    throw new GitFailure(
      "repository_path_limit",
      "Число путей превышает допустимый предел.",
    );
  }
  return records;
}

function singleLine(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

async function optionalReference(
  git: Git,
  args: string[],
): Promise<string | null> {
  try {
    const value = singleLine(await git.run(args));
    if (!value)
      throw new GitFailure("git_output_invalid", "Git вернул пустую ссылку.");
    return value;
  } catch (error) {
    if (
      error instanceof GitFailure &&
      error.code === "git_command_failed" &&
      error.exitCode === 1
    ) {
      return null;
    }
    throw error;
  }
}

async function readBoundedFile(path: string, limit: number): Promise<Buffer> {
  const handle = await open(path, FILE_FLAGS);
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      throw new GitFailure(
        "repository_file_unsupported",
        "Снимок поддерживает только обычные файлы и symlink.",
      );
    }
    if (!Number.isSafeInteger(before.size) || before.size > limit) {
      throw new GitFailure(
        "repository_file_limit",
        "Файл превышает допустимый размер снимка.",
      );
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, limit - bytes + 1));
      const read = await handle.read(chunk, 0, chunk.length, null);
      if (!read.bytesRead) break;
      bytes += read.bytesRead;
      if (bytes > limit) {
        throw new GitFailure(
          "repository_file_limit",
          "Файл превышает допустимый размер снимка.",
        );
      }
      chunks.push(chunk.subarray(0, read.bytesRead));
    }
    const after = await handle.stat();
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      before.mode !== after.mode ||
      bytes !== after.size
    ) {
      throw new GitFailure(
        "repository_changed",
        "Файл изменился во время чтения снимка.",
      );
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    await handle.close();
  }
}

/** Directory fd исключает переход по ancestor symlink даже при замене имени между чтениями. */
async function openParent(
  root: string,
  path: string,
): Promise<FileHandle | null> {
  let parent = await open(root, DIRECTORY_FLAGS);
  try {
    for (const part of path.split("/").slice(0, -1)) {
      let next: FileHandle;
      try {
        next = await open(
          `/proc/self/fd/${parent.fd}/${part}`,
          DIRECTORY_FLAGS,
        );
      } catch (error) {
        if (filesystemCode(error) === "ENOENT") {
          await parent.close();
          return null;
        }
        if (["ELOOP", "ENOTDIR"].includes(filesystemCode(error) ?? "")) {
          throw new GitFailure(
            "repository_path_unsafe",
            "Родитель пути не является обычным каталогом.",
          );
        }
        throw error;
      }
      await parent.close();
      parent = next;
    }
    return parent;
  } catch (error) {
    await parent.close();
    throw error;
  }
}

async function fileState(
  root: string,
  path: string,
  budget: GitSnapshotReadBudget,
  validateContent?: GitContentValidator,
): Promise<FileState> {
  const missing: FileState = {
    path,
    kind: "missing",
    hash: missingHash,
    mode: 0,
  };
  const parent = await openParent(root, path);
  if (!parent) return missing;
  try {
    const target = `/proc/self/fd/${parent.fd}/${path.split("/").at(-1)!}`;
    let stats;
    try {
      stats = await lstat(target);
    } catch (error) {
      if (filesystemCode(error) === "ENOENT") return missing;
      throw error;
    }
    if (!stats.isFile() && !stats.isSymbolicLink()) {
      throw new GitFailure(
        "repository_file_unsupported",
        "Снимок поддерживает только обычные файлы и symlink.",
      );
    }
    const limit = Math.min(MAX_FILE_BYTES, budget.remaining);
    if (stats.size > limit) {
      throw new GitFailure(
        "repository_file_limit",
        "Содержимое превышает допустимый размер снимка.",
      );
    }
    const bytes = stats.isSymbolicLink()
      ? await readlink(target, { encoding: "buffer" })
      : await readBoundedFile(target, limit);
    if (bytes.length > limit) {
      throw new GitFailure(
        "repository_file_limit",
        "Содержимое превышает допустимый размер снимка.",
      );
    }
    const after = await lstat(target);
    if (
      stats.dev !== after.dev ||
      stats.ino !== after.ino ||
      stats.mode !== after.mode ||
      stats.size !== after.size ||
      stats.mtimeMs !== after.mtimeMs ||
      stats.ctimeMs !== after.ctimeMs
    ) {
      throw new GitFailure(
        "repository_changed",
        "Путь изменился во время чтения снимка.",
      );
    }
    validateContent?.(bytes);
    budget.remaining -= bytes.length;
    return {
      path,
      kind: stats.isSymbolicLink() ? "symlink" : "file",
      hash: hash(bytes),
      mode: stats.isSymbolicLink()
        ? 0o120000
        : stats.mode & 0o100
          ? 0o100755
          : 0o100644,
    };
  } finally {
    await parent.close();
  }
}

function safeReadFailure(error: unknown): never {
  if (error instanceof GitFailure || error instanceof PolicyError) throw error;
  if (filesystemCode(error) === "ELOOP") {
    throw new GitFailure(
      "repository_path_unsafe",
      "Чтение через symlink не разрешено.",
    );
  }
  throw new GitFailure(
    "repository_read_failed",
    "Не удалось безопасно прочитать состояние репозитория.",
  );
}

/** Читает весь staged-состав, включая удаления, независимо от разрешённого scope. */
export async function stagedPaths(git: Git): Promise<string[]> {
  const records = nulRecords(
    await git.run([
      "diff",
      "--cached",
      "--name-only",
      "-z",
      "--no-renames",
      "--no-ext-diff",
      "--no-textconv",
      "--",
    ]),
  );
  for (const path of records) assertPath(path);
  return [...new Set(records)].sort(pathOrder);
}

/** Читает точные файлы scope/checkInputs; не обновляет индекс и не следует по symlink. */
export async function inspectRepository(
  git: Git,
  scope: Scope,
  checkInputs: string[],
  validateContent?: GitContentValidator,
): Promise<Snapshot> {
  try {
    const scopePaths = scope.mode === "paths" ? scope.paths : [];
    if (scopePaths.length + checkInputs.length > MAX_PATHS) {
      throw new GitFailure(
        "repository_path_limit",
        "Число входных путей превышает допустимый предел.",
      );
    }
    for (const path of [...scopePaths, ...checkInputs]) assertPath(path);
    const configuredRoot = await realpath(git.root);
    const root = await realpath(
      singleLine(await git.run(["rev-parse", "--show-toplevel"])),
    );
    if (configuredRoot !== root) {
      throw new GitFailure(
        "repository_root_mismatch",
        "Настроенный путь не является корнем рабочей копии.",
      );
    }
    git.root = root;
    const [gitPath, commonPath, head, branchReference, status] =
      await Promise.all([
        git.run(["rev-parse", "--absolute-git-dir"]),
        git.run(["rev-parse", "--path-format=absolute", "--git-common-dir"]),
        optionalReference(git, ["rev-parse", "--verify", "--quiet", "HEAD"]),
        optionalReference(git, ["symbolic-ref", "--quiet", "HEAD"]),
        git.run([
          "status",
          "--porcelain=v1",
          "-z",
          "--no-renames",
          "--untracked-files=all",
          "--ignore-submodules=none",
        ]),
      ]);
    if (head !== null && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(head)) {
      throw new GitFailure(
        "git_output_invalid",
        "Git вернул недопустимый HEAD.",
      );
    }
    const branch = branchReference?.startsWith("refs/heads/")
      ? branchReference.slice(11)
      : null;
    if (branchReference !== null && !branch) {
      throw new GitFailure(
        "repository_head_invalid",
        "HEAD не указывает на локальную ветку.",
      );
    }
    if (head === null && branch === null) {
      throw new GitFailure(
        "repository_head_invalid",
        "HEAD не указывает на commit или unborn branch.",
      );
    }
    const [gitDir, commonDir] = await Promise.all([
      realpath(resolve(root, singleLine(gitPath))),
      realpath(resolve(root, singleLine(commonPath))),
    ]);
    const selected = new Set(scopePaths);
    const changes: Change[] = [];
    for (const record of nulRecords(status)) {
      if (
        record.length < 4 ||
        record[2] !== " " ||
        !/^[ MADRCU?!T]{2}$/u.test(record.slice(0, 2))
      ) {
        throw new GitFailure(
          "git_output_invalid",
          "Git вернул недопустимую запись состояния.",
        );
      }
      const path = record.slice(3);
      assertPath(path);
      if (scope.mode === "all" || selected.has(path)) {
        changes.push({ path, status: record.slice(0, 2) });
      }
    }
    changes.sort((left, right) => pathOrder(left.path, right.path));
    let indexHash: string;
    try {
      indexHash = hash(
        await readBoundedFile(join(gitDir, "index"), MAX_INDEX_BYTES),
      );
    } catch (error) {
      if (filesystemCode(error) !== "ENOENT") throw error;
      indexHash = missingHash;
    }
    const paths = [
      ...new Set([...changes.map((change) => change.path), ...checkInputs]),
    ].sort(pathOrder);
    if (paths.length > MAX_PATHS) {
      throw new GitFailure(
        "repository_path_limit",
        "Число файлов снимка превышает допустимый предел.",
      );
    }
    const files: FileState[] = [];
    const budget = { remaining: MAX_TOTAL_BYTES };
    for (const path of paths)
      files.push(await fileState(root, path, budget, validateContent));
    const fingerprint = hash(
      JSON.stringify({ root, head, branch, indexHash, files }),
    );
    return {
      root,
      gitDir,
      commonDir,
      head,
      branch,
      indexHash,
      changes,
      files,
      fingerprint,
    };
  } catch (error) {
    return safeReadFailure(error);
  }
}
