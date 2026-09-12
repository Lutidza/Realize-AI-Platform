/**
 * @file services/ai-control-plane/src/readPrivateAssetFile.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Читает ограниченный обычный файл без symlink, hardlink и гонки замены inode.
 */
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";

export const readPrivateAssetFile = async (
  path: string,
  maxBytes: number,
): Promise<Buffer> => {
  if ((await realpath(path)) !== path)
    throw new Error("Invalid private file path.");
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stats = await file.stat();
    const named = await lstat(path);
    if (
      !stats.isFile() ||
      stats.nlink !== 1 ||
      stats.size > maxBytes ||
      stats.dev !== named.dev ||
      stats.ino !== named.ino ||
      (await realpath(path)) !== path
    )
      throw new Error("Invalid private file.");
    const data = Buffer.alloc(stats.size + 1);
    let offset = 0;
    while (offset < data.length) {
      const result = await file.read(
        data,
        offset,
        data.length - offset,
        offset,
      );
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    const after = await file.stat();
    if (
      offset !== stats.size ||
      after.size !== stats.size ||
      after.mtimeMs !== stats.mtimeMs
    )
      throw new Error("Private file changed while reading.");
    return data.subarray(0, offset);
  } finally {
    await file.close();
  }
};
