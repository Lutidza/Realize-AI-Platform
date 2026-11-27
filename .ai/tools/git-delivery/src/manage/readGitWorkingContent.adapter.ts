/**
 * @file .ai/tools/git-delivery/src/manage/readGitWorkingContent.adapter.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Читает ограниченный снимок обычного файла через directory descriptors без переходов по symlink.
 * @see .ai/tools/git-delivery/README.md
 */
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { PolicyError } from "@realize/git-runtime";
import type { GitManageWorkingContent } from "./GitManage.types.ts";

const MAX_WORKING_CONTENT = 1024 * 1024;
export async function readGitWorkingContent(
  root: string,
  path: string,
): Promise<GitManageWorkingContent | null> {
  let directory = await open(
    root,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  let file: FileHandle | undefined;
  try {
    const parts = path.split("/");
    for (const part of parts.slice(0, -1)) {
      const next = await open(
        `/proc/self/fd/${directory.fd}/${part}`,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      await directory.close();
      directory = next;
    }
    file = await open(
      `/proc/self/fd/${directory.fd}/${parts.at(-1)}`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_WORKING_CONTENT)
      throw new PolicyError(
        "manage_diff_content_invalid",
        "Поддерживаются обычные файлы до 1 MiB.",
      );
    const bytes = Buffer.alloc(MAX_WORKING_CONTENT + 1);
    let size = 0;
    while (size < bytes.length) {
      const read = await file.read(bytes, size, bytes.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    const after = await file.stat();
    if (
      size > MAX_WORKING_CONTENT ||
      stat.size !== size ||
      stat.mode !== after.mode ||
      stat.mtimeMs !== after.mtimeMs ||
      stat.ctimeMs !== after.ctimeMs
    )
      throw new PolicyError(
        "manage_diff_content_invalid",
        "Рабочий файл изменился или превысил лимит.",
      );
    return {
      bytes: bytes.subarray(0, size),
      mode: stat.mode & 0o111 ? "100755" : "100644",
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof PolicyError) throw error;
    throw new PolicyError(
      "manage_diff_content_invalid",
      "Рабочий путь недоступен или содержит symlink.",
    );
  } finally {
    await file?.close();
    await directory.close();
  }
}
