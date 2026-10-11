/**
 * @file scripts/release/readReleaseSourceFiles.adapter.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Читает ограниченный набор исходников без symlinks, traversal и локальных secrets.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { releaseSourcePathSchema } from "@realize/ai-contracts/platform-release";
import type { ReleaseSourceFilesInput } from "./PlatformSourceInventory.types.ts";

const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".ai-workspace",
  "__pycache__",
]);
const EXCLUDED_SOURCE_ROOTS = ["src/RealizeCore", "src/app/_realize"];

const sourcePath = async (sourceRoot: string, path: string) => {
  releaseSourcePathSchema.parse(path);
  if (
    path
      .split("/")
      .some((part) => part.startsWith(".env") || /\.(pem|key)$/i.test(part))
  ) {
    throw new Error("Secret file paths are not release source artifacts");
  }
  const root = await realpath(sourceRoot);
  const candidate = resolve(root, path);
  if (
    !candidate.startsWith(`${root}${sep}`) ||
    (await realpath(candidate)) !== candidate
  ) {
    throw new Error(`Release source path must not traverse a symlink: ${path}`);
  }
  return candidate;
};

/** JSON читается только как данные; candidate code никогда не исполняется для inventory. */
export const readReleaseSourceJSON = async (
  sourceRoot: string,
  path: string,
): Promise<unknown> => {
  const absolute = await sourcePath(sourceRoot, path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024)
    throw new Error(`Invalid source JSON size: ${path}`);
  return JSON.parse(await readFile(absolute, "utf8"));
};

/** Хеширует exact bytes; пути отсортированы побайтово, повтор roots не дублирует артефакты. */
export const readReleaseSourceFiles = async (
  input: ReleaseSourceFilesInput,
) => {
  const files = new Map<string, string>();
  let bytesRead = 0;
  const visit = async (path: string): Promise<void> => {
    if (
      EXCLUDED_SOURCE_ROOTS.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      )
    )
      return;
    const absolute = await sourcePath(input.sourceRoot, path);
    const stat = await lstat(absolute);
    if (stat.isDirectory()) {
      const names = (await readdir(absolute)).sort();
      for (const name of names) {
        if (!EXCLUDED_DIRECTORIES.has(name)) await visit(`${path}/${name}`);
      }
      return;
    }
    if (!stat.isFile())
      throw new Error(`Release source is not a regular file: ${path}`);
    if (files.has(path)) return;
    bytesRead += stat.size;
    if (
      files.size >= 20000 ||
      stat.size > 32 * 1024 * 1024 ||
      bytesRead > 256 * 1024 * 1024
    ) {
      throw new Error("Release source inventory exceeds its read budget");
    }
    files.set(
      path,
      createHash("sha256")
        .update(await readFile(absolute))
        .digest("hex"),
    );
  };
  for (const path of input.paths) await visit(path);
  return [...files]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([path, sha256]) => ({ path, sha256 }));
};
