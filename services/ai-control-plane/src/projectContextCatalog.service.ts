/**
 * @file services/ai-control-plane/src/projectContextCatalog.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Читает единый безопасный контур проекта для каталога и неизменяемого Context Pack.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type {
  ProjectContextEntry,
  ProjectContextQuery,
} from "./ProjectContext.types";

const ROOT_FILES = [
  ".dockerignore",
  ".node-version",
  ".nvmrc",
  "AGENTS.md",
  "Dockerfile",
  "compose.yaml",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "tsconfig.json",
  "vitest.config.mts",
];
const ROOT_DIRECTORIES = [
  ".ai",
  ".codex",
  ".github",
  "documentation",
  "packages",
  "scripts",
  "services",
  "src",
  "tests",
];
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".playwright-mcp",
  ".postgres",
  ".runtime",
  "artifacts",
  "coverage",
  "node_modules",
  "playwright-report",
  "sessions",
  "test-results",
]);
const EXCLUDED_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".db",
  ".dump",
  ".gif",
  ".gz",
  ".jpeg",
  ".jpg",
  ".key",
  ".mov",
  ".mp3",
  ".mp4",
  ".p12",
  ".pdf",
  ".pem",
  ".png",
  ".sqlite",
  ".tar",
  ".webm",
  ".webp",
  ".zip",
]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

const containsSensitiveName = (path: string): boolean => {
  const name = basename(path).toLowerCase();
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name === "auth.json" ||
    name.includes("credentials") ||
    name.endsWith(".secret")
  );
};

const extension = (path: string): string => {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
};

/** Возвращает проверенные байты вместе с хешем, не перечитывая путь после проверки. */
export const collectProjectContext = async (
  workspaceRoot: string,
  options: ProjectContextQuery = {},
): Promise<ProjectContextEntry[]> => {
  const root = await realpath(resolve(workspaceRoot));
  const files: ProjectContextEntry[] = [];
  let totalBytes = 0;
  const visit = async (source: string): Promise<void> => {
    if (options.limit && files.length >= options.limit) return;
    const path = relative(root, source);
    if (
      path === ".ai/tools/agent-runtime/runtime" ||
      path.startsWith(`..${sep}`) ||
      path === ".." ||
      containsSensitiveName(path)
    )
      return;
    const stats = await lstat(source);
    if (stats.isSymbolicLink()) return;
    if (stats.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(basename(source))) return;
      for (const child of (await readdir(source)).sort())
        await visit(join(source, child));
      return;
    }
    if (
      (options.query && !path.toLowerCase().includes(options.query)) ||
      (options.paths && !options.paths.has(path))
    )
      return;
    if (
      !stats.isFile() ||
      stats.nlink !== 1 ||
      stats.size > MAX_FILE_BYTES ||
      EXCLUDED_EXTENSIONS.has(extension(source))
    )
      return;
    // realpath проверяет также заменённые symlink-родители; O_NOFOLLOW защищает последний сегмент.
    if ((await realpath(source)) !== source) return;
    const handle = await open(
      source,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let data: Buffer;
    try {
      const current = await handle.stat();
      const named = await lstat(source);
      if (
        current.dev !== named.dev ||
        current.ino !== named.ino ||
        (await realpath(source)) !== source
      )
        return;
      if (
        !current.isFile() ||
        current.nlink !== 1 ||
        current.size > MAX_FILE_BYTES
      )
        return;
      data = Buffer.alloc(current.size + 1);
      const { bytesRead } = await handle.read(data, 0, data.length, 0);
      if (bytesRead > MAX_FILE_BYTES || bytesRead !== current.size) return;
      data = data.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
    if (data.includes(0)) return;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      return;
    }
    totalBytes += data.length;
    if (totalBytes > MAX_TOTAL_BYTES)
      throw new Error("Context Pack exceeds the 50 MiB safety limit.");
    files.push({
      data,
      file: {
        path: path.split(sep).join("/"),
        size: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      },
    });
  };
  for (const name of [...ROOT_FILES, ...ROOT_DIRECTORIES]) {
    try {
      await visit(join(root, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return files;
};
