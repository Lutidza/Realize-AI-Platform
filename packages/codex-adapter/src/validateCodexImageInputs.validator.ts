/**
 * @file packages/codex-adapter/src/validateCodexImageInputs.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет изображения внутри серверного снимка до передачи localImage в Codex.
 */

import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import {
  CHAT_ATTACHMENT_LIMITS,
  type RunTurnInput,
} from "@realize/ai-contracts";
import type { CodexLocalImageInput } from "./OpenAICodex.types";

/** Ссылки и hardlinks запрещены; файлы уже принадлежат приватному серверному снимку. */
export const validateCodexImageInputs = async (
  cwd: string,
  images: RunTurnInput["images"],
): Promise<CodexLocalImageInput[]> => {
  if (images === undefined) return [];
  try {
    if (
      !Array.isArray(images) ||
      images.length > CHAT_ATTACHMENT_LIMITS.maxFiles
    )
      throw new Error();
    if (!images.length) return [];
    if (
      !isAbsolute(cwd) ||
      resolve(cwd) !== cwd ||
      (await realpath(cwd)) !== cwd ||
      !(await lstat(cwd)).isDirectory()
    )
      throw new Error();
    const result: CodexLocalImageInput[] = [];
    let totalBytes = 0;
    for (const image of images) {
      const path = image?.path;
      if (
        typeof path !== "string" ||
        path.includes("\0") ||
        !isAbsolute(path) ||
        resolve(path) !== path ||
        !path.startsWith(`${cwd}${sep}`) ||
        (await realpath(path)) !== path
      )
        throw new Error();
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
          stats.size === 0 ||
          stats.size > CHAT_ATTACHMENT_LIMITS.maxImageBytes ||
          named.isSymbolicLink() ||
          named.dev !== stats.dev ||
          named.ino !== stats.ino ||
          (await realpath(path)) !== path
        )
          throw new Error();
        totalBytes += stats.size;
        if (totalBytes > CHAT_ATTACHMENT_LIMITS.maxTotalBytes)
          throw new Error();
        const header = Buffer.alloc(12);
        const { bytesRead } = await file.read(header, 0, header.length, 0);
        const png =
          bytesRead >= 8 &&
          header
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg =
          bytesRead >= 3 &&
          header[0] === 255 &&
          header[1] === 216 &&
          header[2] === 255;
        const webp =
          bytesRead === 12 &&
          header.toString("ascii", 0, 4) === "RIFF" &&
          header.toString("ascii", 8, 12) === "WEBP";
        if (!png && !jpeg && !webp) throw new Error();
        result.push({ type: "localImage", path });
      } finally {
        await file.close();
      }
    }
    return result;
  } catch {
    throw new Error(
      "Изображение недоступно или не соответствует разрешённому файловому контексту.",
    );
  }
};
