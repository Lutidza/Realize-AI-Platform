/**
 * @file .ai/tools/git-delivery/src/GitJournal.repository.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Безопасное чтение и атомарная запись JSON-журнала Git-операции.
 */
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { PolicyError } from "./contracts.ts";
import type { GitJournalContext } from "./GitJournal.types.ts";

const MAX_JOURNAL_BYTES = 2 * 1024 * 1024;

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

/**
 * Хранит JSON по проверенному контексту; схему журнала проверяет вызывающая операция.
 * Дескрипторы каталогов удерживают путь, а права файла ограничивают доступ владельцем.
 */
export class GitJournalRepository {
  private readonly context: GitJournalContext;

  constructor(context: GitJournalContext) {
    this.context = context;
  }

  get relativePath(): string {
    return `.ai-workspace/tasks/${this.context.taskId}/logs/git-delivery/${this.context.requestId}.json`;
  }

  /** Читает ограниченный UTF-8 JSON; отсутствие файла или каталога возвращает null. */
  async load(): Promise<unknown | null> {
    let parent;
    try {
      parent = await parentDirectory(
        this.context.repositoryRoot,
        this.relativePath,
        false,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new PolicyError(
        "journal_unavailable",
        "Недоступен каталог журнала.",
      );
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
          stat.size > MAX_JOURNAL_BYTES ||
          stat.mode & 0o077 ||
          stat.uid !== process.getuid?.()
        ) {
          throw new PolicyError(
            "invalid_journal",
            "Журнал должен быть личным файлом допустимого размера.",
          );
        }
        const bytes = Buffer.alloc(MAX_JOURNAL_BYTES + 1);
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
        return JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(0, size),
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

  /** Проверяет размер до записи и заменяет файл после fsync; схема JSON не ограничена. */
  async save(value: unknown): Promise<void> {
    let json: string | undefined;
    try {
      json = JSON.stringify(value);
    } catch {
      throw new PolicyError(
        "invalid_journal",
        "Журнал нельзя представить в JSON.",
      );
    }
    if (json === undefined)
      throw new PolicyError(
        "invalid_journal",
        "Журнал нельзя представить в JSON.",
      );
    const bytes = Buffer.from(json + "\n", "utf8");
    if (bytes.length > MAX_JOURNAL_BYTES)
      throw new PolicyError(
        "invalid_journal",
        "Журнал превышает допустимый размер.",
      );

    const parent = await parentDirectory(
      this.context.repositoryRoot,
      this.relativePath,
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
        await file.writeFile(bytes);
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
}
