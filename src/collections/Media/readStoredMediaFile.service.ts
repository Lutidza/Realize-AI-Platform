/**
 * @file src/collections/Media/readStoredMediaFile.service.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Читает ограниченный файл из доверенного native хранилища без переходов по ссылкам.
 * @see documentation/specifications/media-management.md
 */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";

export async function readStoredMediaFile(
  root: string,
  filename: string | null | undefined,
  maxBytes = 25 * 1024 * 1024,
) {
  if (
    !filename ||
    path.basename(filename) !== filename ||
    filename.includes("\\")
  )
    throw new Error("Недопустимое имя сохранённого файла.");
  const file = await open(
    path.join(root, filename),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes)
      throw new Error("Недопустимый размер сохранённого файла.");
    return await file.readFile();
  } finally {
    await file.close();
  }
}
