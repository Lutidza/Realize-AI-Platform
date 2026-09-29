/**
 * @file services/ai-control-plane/src/readRepositoryFile.service.ts
 * @version 1.2.0
 * @date 2026-09-28
 * @description Читает проверенный descriptor и вычисляет hash из тех же байтов.
 * @see documentation/specifications/internal-mcp.md
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { openRepositoryDirectory } from "./openRepositoryDirectory.adapter";
import { assertNoGitSecrets } from "../../../.ai/tools/git-delivery/src/commit/assertNoGitSecrets.validator";
import { RepositoryReadError } from "./RepositoryRead.error";
import type {
  RepositoryFile,
  RepositoryReadOptions,
  RepositoryReadPolicy,
} from "./RepositoryRead.types";
import {
  isRepositoryPathAllowed,
  parseRepositoryPath,
  REPOSITORY_MAX_FILE_BYTES,
} from "./repositoryReadPolicy.validator";

export function assertRepositoryReadActive(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new RepositoryReadError(
      "TIMEOUT",
      "Чтение отменено или превысило срок.",
    );
}

/** Проверяет и исторические bytes; детектор секретов общий с Git delivery. */
export function decodeRepositoryText(bytes: Buffer): string {
  return decodeRepositoryContent(bytes).text;
}

/** Binary bytes допускаются только внутри Git owner; ни текст, ни patch из них не выдаётся. */
export function decodeRepositoryContent(
  bytes: Buffer,
  allowBinary = false,
): { text: string; binary: boolean } {
  if (bytes.length > REPOSITORY_MAX_FILE_BYTES)
    throw new RepositoryReadError("RESULT_LIMIT", "Файл превышает 2 MiB.");
  try {
    assertNoGitSecrets(bytes);
  } catch {
    throw new RepositoryReadError(
      "FORBIDDEN",
      "Содержимое требует проверки на секреты.",
    );
  }
  let text: string;
  try {
    if (bytes.includes(0)) throw new Error();
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    if (allowBinary) return { text: "", binary: true };
    throw new RepositoryReadError(
      "FORBIDDEN",
      "Содержимое не является текстом UTF-8.",
    );
  }
  return { text, binary: false };
}

/**
 * Никакие bytes не возвращаются после замены пути, изменения inode или версии.
 * maximumBytes сужает общий лимит до открытия файла; параметр задаёт владелец операции.
 */
export async function readRepositoryFile(
  policy: RepositoryReadPolicy,
  path: string,
  options: RepositoryReadOptions & {
    allowBinary?: boolean;
    maximumBytes?: number;
    /** Считает фактическое чтение, включая bytes впоследствии отклонённого содержимого. */
    onReadBytes?: (bytes: number) => void;
  } = {},
): Promise<RepositoryFile> {
  parseRepositoryPath(path);
  if (!isRepositoryPathAllowed(policy, path))
    throw new RepositoryReadError(
      "FORBIDDEN",
      "Путь недоступен политике чтения.",
    );
  assertRepositoryReadActive(options.signal);
  const maximumBytes = Math.min(
    REPOSITORY_MAX_FILE_BYTES,
    options.maximumBytes ?? REPOSITORY_MAX_FILE_BYTES,
  );
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0)
    throw new RepositoryReadError(
      "INVALID_INPUT",
      "Некорректный лимит чтения.",
    );
  const parent = await openRepositoryDirectory(
    policy,
    dirname(path) === "." ? "" : dirname(path),
  );
  const source = join(parent.descriptorPath, basename(path));
  try {
    const before = await lstat(source, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== BigInt(1)
    ) {
      throw new RepositoryReadError(
        "FORBIDDEN",
        "Требуется обычный файл без ссылок.",
      );
    }
    if (before.size > maximumBytes)
      throw new RepositoryReadError(
        "RESULT_LIMIT",
        "Файл превышает допустимый размер чтения.",
      );
    const handle = await open(
      source,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const opened = await handle.stat({ bigint: true });
      if (
        !opened.isFile() ||
        opened.nlink !== BigInt(1) ||
        opened.dev !== before.dev ||
        opened.ino !== before.ino ||
        opened.size !== before.size ||
        opened.mtimeNs !== before.mtimeNs ||
        opened.ctimeNs !== before.ctimeNs
      ) {
        throw new RepositoryReadError(
          "CONFLICT",
          "Файл изменился во время открытия.",
        );
      }
      assertRepositoryReadActive(options.signal);
      const bytes = Buffer.alloc(Number(opened.size) + 1);
      let length = 0;
      while (length < bytes.length) {
        assertRepositoryReadActive(options.signal);
        const chunk = await handle.read(
          bytes,
          length,
          Math.min(64 * 1024, bytes.length - length),
          length,
        );
        if (!chunk.bytesRead) break;
        options.onReadBytes?.(chunk.bytesRead);
        length += chunk.bytesRead;
      }
      const after = await handle.stat({ bigint: true });
      const named = await lstat(source, { bigint: true });
      await parent.verify();
      if (
        BigInt(length) !== opened.size ||
        after.size !== opened.size ||
        after.mtimeNs !== opened.mtimeNs ||
        after.ctimeNs !== opened.ctimeNs ||
        after.nlink !== BigInt(1) ||
        named.dev !== opened.dev ||
        named.ino !== opened.ino ||
        named.isSymbolicLink()
      ) {
        throw new RepositoryReadError(
          "CONFLICT",
          "Файл изменился во время чтения.",
        );
      }
      assertRepositoryReadActive(options.signal);
      const content = bytes.subarray(0, length);
      return {
        path,
        bytes: content,
        ...decodeRepositoryContent(content, options.allowBinary),
        mode: Number(opened.mode),
        sha256: createHash("sha256").update(content).digest("hex"),
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof RepositoryReadError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new RepositoryReadError("NOT_FOUND", "Файл не найден.");
    if (
      ["ELOOP", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")
    )
      throw new RepositoryReadError(
        "CONFLICT",
        "Путь изменился во время чтения.",
      );
    throw error;
  } finally {
    await parent.close();
  }
}
