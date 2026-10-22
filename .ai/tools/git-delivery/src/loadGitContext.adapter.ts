/**
 * @file .ai/tools/git-delivery/src/loadGitContext.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Читает назначенный личный JSON-файл контекста с проверкой владельца, прав и размера.
 */
import { PolicyError } from "@realize/git-runtime";

import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";

/** Возвращает JSON из явного пути; проверка схемы контекста остаётся у потребителя. */
export async function loadGitContext(
  path: string | undefined,
): Promise<unknown> {
  if (!path || !isAbsolute(path))
    throw new PolicyError(
      "context_required",
      "Механизм запуска должен назначить абсолютный REALIZE_GIT_CONTEXT_FILE.",
    );
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.size > 1024 * 1024 ||
      stat.uid !== process.getuid?.() ||
      stat.mode & 0o077
    ) {
      throw new PolicyError(
        "context_unsafe",
        "Контекст должен быть личным файлом текущего пользователя размером до 1 MiB.",
      );
    }
    const bytes = Buffer.alloc(1024 * 1024 + 1);
    let size = 0;
    while (size < bytes.length) {
      const read = await file.read(bytes, size, bytes.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > 1024 * 1024)
      throw new PolicyError(
        "context_unsafe",
        "Контекст превышает допустимый размер.",
      );
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)),
    );
  } finally {
    await file.close();
  }
}
