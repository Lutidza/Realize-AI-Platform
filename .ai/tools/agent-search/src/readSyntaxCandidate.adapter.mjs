/**
 * @file .ai/tools/agent-search/src/readSyntaxCandidate.adapter.mjs
 * @version 1.1.0
 * @date 2026-09-28
 * @description Читает ограниченный CLI-кандидат без symlink, hardlink и невалидного UTF-8.
 */
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { SYNTAX_MAX_FILE_BYTES } from "./syntaxSearch.config.mjs";

/** MCP использует собственный strict reader; этот adapter не расширяет CLI-профиль. */
export async function readSyntaxCandidate(
  root,
  filePath,
  signal,
  options = {},
) {
  signal?.throwIfAborted();
  const fullPath = resolve(root, filePath);
  if (
    !fullPath.startsWith(`${root}/`) ||
    (await realpath(fullPath)) !== fullPath
  )
    return null;
  const before = await lstat(fullPath, { bigint: true });
  if (
    !before.isFile() ||
    before.nlink !== 1n ||
    before.size >
      BigInt(
        Math.min(
          SYNTAX_MAX_FILE_BYTES,
          options.maximumBytes ?? SYNTAX_MAX_FILE_BYTES,
        ),
      )
  )
    return null;
  const handle = await open(
    fullPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    if (!sameFile(before, await handle.stat({ bigint: true }))) return null;
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      signal?.throwIfAborted();
      const read = await handle.read(
        bytes,
        length,
        Math.min(65536, bytes.length - length),
        null,
      );
      if (!read.bytesRead) break;
      options.onReadBytes?.(read.bytesRead);
      length += read.bytesRead;
    }
    signal?.throwIfAborted();
    if (
      length !== Number(before.size) ||
      !sameFile(before, await handle.stat({ bigint: true })) ||
      !sameFile(before, await lstat(fullPath, { bigint: true })) ||
      (await realpath(fullPath)) !== fullPath
    )
      return null;
    const content = bytes.subarray(0, length);
    if (content.includes(0)) return null;
    try {
      // Как rg, CLI пропускает начальный BOM; bytesRead сохраняет реальные bytes.
      return {
        text: new TextDecoder("utf-8", { fatal: true }).decode(content),
        bytesRead: length,
      };
    } catch {
      return null;
    }
  } finally {
    await handle.close();
  }
}

function sameFile(left, right) {
  return (
    right.isFile() &&
    right.nlink === 1n &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}
