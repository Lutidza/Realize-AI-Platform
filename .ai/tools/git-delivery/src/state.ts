/**
 * @file .ai/tools/git-delivery/src/state.ts
 * @version 1.0.1
 * @date 2026-09-09
 * @description Журнал ADR-0016 сохраняется до побочного эффекта; flock принадлежит времени жизни процесса.
 */
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PolicyError, relativeFile } from "./contracts.ts";
import type { Context, Result } from "./contracts.ts";
import type { Snapshot } from "./repository.ts";
import { GitJournalRepository } from "./GitJournal.repository.ts";

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
  return new GitJournalRepository(context).relativePath;
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

export async function loadJournal(context: Context): Promise<Journal | null> {
  const value = await new GitJournalRepository(context).load();
  return value === null ? null : validateJournal(value);
}

export async function saveJournal(
  context: Context,
  journal: Journal,
): Promise<void> {
  await new GitJournalRepository(context).save(journal);
}
