/** Журнал ADR-0016 сохраняется до побочного эффекта; flock принадлежит времени жизни процесса. */
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, mkdir, rename, unlink, realpath, lstat } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PolicyError, relativeFile } from "./contracts.ts";
import type { Context, Result } from "./contracts.ts";
import type { Snapshot } from "./repository.ts";

export type Journal = {
  version: 1;
  binding: string;
  original: Snapshot;
  paths: string[];
  noop?: true;
  preparedTree?: string;
  commit?: string;
  result?: Result;
};

export async function acquireLock(commonDirectory: string): Promise<{
  descriptor: number;
  assertHeld(): void;
  release(): Promise<void>;
}> {
  if (process.platform !== "linux")
    throw new PolicyError(
      "unsupported_platform",
      "Первый этап требует Linux и flock.",
    );
  const directory = await open(
    await realpath(commonDirectory),
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  // Блокируется существующий каталог: inspect не создаёт даже отдельный lock-файл.
  let alive = true;
  try {
    await new Promise<void>((resolve, reject) => {
      // flock и родитель разделяют open file description; выход flock не снимает lock.
      const child = spawn(
        "flock",
        ["--exclusive", "--nonblock", "--conflict-exit-code", "73", "3"],
        {
          shell: false,
          stdio: ["ignore", "ignore", "ignore", directory.fd],
        },
      );
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      child.once("error", () => {
        clearTimeout(timer);
        reject(
          new PolicyError("lock_unavailable", "Не удалось запустить flock."),
        );
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else
          reject(
            new PolicyError(
              code === 73 ? "repository_locked" : "lock_failed",
              "Репозиторий занят или блокировка недоступна.",
            ),
          );
      });
    });
  } catch (error) {
    await directory.close();
    throw error;
  }
  return {
    descriptor: directory.fd,
    assertHeld() {
      if (!alive) {
        throw new PolicyError("lock_lost", "Блокировка операции потеряна.");
      }
    },
    async release() {
      alive = false;
      await directory.close();
    },
  };
}

export function journalRelativePath(context: Context): string {
  return `.ai-workspace/tasks/${context.taskId}/logs/git-delivery/${context.requestId}.json`;
}

function isHash(value: unknown, length?: number): value is string {
  return (
    typeof value === "string" &&
    (length
      ? new RegExp(`^[a-f0-9]{${length}}$`).test(value)
      : /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value))
  );
}

function validateJournal(value: unknown): Journal {
  const source = value as Journal | null;
  if (
    !source ||
    source.version !== 1 ||
    !isHash(source.binding, 64) ||
    !source.original ||
    !isHash(source.original.head) ||
    typeof source.original.branch !== "string" ||
    !isHash(source.original.fingerprint, 64) ||
    !isHash(source.original.indexHash, 64) ||
    !Array.isArray(source.original.files) ||
    source.original.files.length > 10000 ||
    !Array.isArray(source.original.changes) ||
    source.original.changes.length > 2048 ||
    ![
      source.original.root,
      source.original.gitDir,
      source.original.commonDir,
    ].every((path) => typeof path === "string" && path.startsWith("/")) ||
    !Array.isArray(source.paths) ||
    (!source.paths.length && source.noop !== true) ||
    (source.noop !== undefined &&
      (source.noop !== true ||
        source.paths.length !== 0 ||
        source.commit !== undefined ||
        source.preparedTree !== undefined)) ||
    source.paths.length > 2048 ||
    new Set(source.paths).size !== source.paths.length ||
    (source.preparedTree !== undefined && !isHash(source.preparedTree)) ||
    (source.commit !== undefined && !isHash(source.commit))
  ) {
    throw new PolicyError(
      "invalid_journal",
      "Журнал операции повреждён или несовместим.",
    );
  }
  for (const path of source.paths) relativeFile(path);
  for (const change of source.original.changes) {
    relativeFile(change.path);
    if (
      typeof change.status !== "string" ||
      !/^[ MADRCU?!T]{2}$/.test(change.status)
    ) {
      throw new PolicyError(
        "invalid_journal",
        "Некорректное состояние пути в журнале.",
      );
    }
  }
  for (const file of source.original.files) {
    relativeFile(file.path);
    if (
      !["file", "symlink", "missing"].includes(file.kind) ||
      !isHash(file.hash, 64) ||
      ![0, 0o100644, 0o100755, 0o120000].includes(file.mode)
    )
      throw new PolicyError(
        "invalid_journal",
        "Некорректный снимок в журнале.",
      );
  }
  const filePaths = new Set(source.original.files.map((file) => file.path));
  if (
    filePaths.size !== source.original.files.length ||
    source.paths.some((path) => !filePaths.has(path))
  ) {
    throw new PolicyError(
      "invalid_journal",
      "Состав журнала не соответствует снимку.",
    );
  }
  const { root, head, branch, indexHash, files } = source.original;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ root, head, branch, indexHash, files }))
    .digest("hex");
  if (
    fingerprint !== source.original.fingerprint ||
    JSON.stringify(source.paths) !==
      JSON.stringify(source.original.changes.map((change) => change.path))
  ) {
    throw new PolicyError(
      "invalid_journal",
      "Отпечаток или состав журнала изменён.",
    );
  }
  return source;
}

// Каждый каталог открывается отдельно, чтобы symlink не перенаправлял запись журнала.
async function parentDirectory(
  root: string,
  relative: string,
  create: boolean,
) {
  const parts = relative.split("/");
  const filename = parts.pop()!;
  let directory = await open(
    root,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    for (const part of parts) {
      const candidate = `/proc/self/fd/${directory.fd}/${part}`;
      if (create) {
        await mkdir(candidate, { mode: 0o700 }).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== "EEXIST") throw error;
          },
        );
        await directory.sync();
      }
      const next = await open(
        candidate,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      await directory.close();
      directory = next;
    }
    return { directory, filename };
  } catch (error) {
    await directory.close();
    throw error;
  }
}

export async function loadJournal(context: Context): Promise<Journal | null> {
  let parent;
  try {
    parent = await parentDirectory(
      context.repositoryRoot,
      journalRelativePath(context),
      false,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new PolicyError("journal_unavailable", "Недоступен каталог журнала.");
  }
  try {
    let file;
    try {
      file = await open(
        `/proc/self/fd/${parent.directory.fd}/${parent.filename}`,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size > 2 * 1024 * 1024 ||
        stat.mode & 0o077 ||
        stat.uid !== process.getuid?.()
      ) {
        throw new PolicyError(
          "invalid_journal",
          "Журнал должен быть личным файлом допустимого размера.",
        );
      }
      const bytes = Buffer.alloc(2 * 1024 * 1024 + 1);
      let size = 0;
      while (size < bytes.length) {
        const read = await file.read(bytes, size, bytes.length - size, null);
        if (!read.bytesRead) break;
        size += read.bytesRead;
      }
      if (size === bytes.length)
        throw new PolicyError(
          "invalid_journal",
          "Журнал превышает допустимый размер.",
        );
      return validateJournal(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(0, size),
          ),
        ),
      );
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof PolicyError) throw error;
    throw new PolicyError(
      "invalid_journal",
      "Не удалось прочитать журнал операции.",
    );
  } finally {
    await parent.directory.close();
  }
}

export async function saveJournal(
  context: Context,
  journal: Journal,
): Promise<void> {
  const parent = await parentDirectory(
    context.repositoryRoot,
    journalRelativePath(context),
    true,
  );
  const base = `/proc/self/fd/${parent.directory.fd}`;
  const temporary = join(base, `.${randomUUID()}.tmp`);
  try {
    const existing = await lstat(join(base, parent.filename)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (existing && !existing.isFile())
      throw new PolicyError(
        "invalid_journal",
        "Путь журнала не является обычным файлом.",
      );
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(journal) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, join(base, parent.filename));
    await parent.directory.sync();
  } finally {
    await unlink(temporary).catch(() => {});
    await parent.directory.close();
  }
}
