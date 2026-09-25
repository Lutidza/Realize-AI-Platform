/**
 * @file services/ai-control-plane/src/repositoryReadPolicy.validator.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Задаёт единый allowlist и исключения чтения для Context Pack и MCP.
 * @see documentation/specifications/internal-mcp.md
 */
import { realpath, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { RepositoryReadError } from "./RepositoryRead.error";
import type { RepositoryReadPolicy } from "./RepositoryRead.types";

export const REPOSITORY_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const REPOSITORY_MAX_SCAN_BYTES = 50 * 1024 * 1024;
export const REPOSITORY_MAX_SCAN_ENTRIES = 10_000;
export const REPOSITORY_ROOT_FILES = [
  ".dockerignore",
  ".node-version",
  ".nvmrc",
  "AGENTS.md",
  "Dockerfile",
  "README.md",
  "compose.yaml",
  "next.config.ts",
  "next.config.mjs",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "tsconfig.json",
  "vitest.config.mts",
  "eslint.config.mjs",
];
export const REPOSITORY_ROOT_DIRECTORIES = [
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
const excludedSegments = new Set([
  ".git",
  ".next",
  ".ai-workspace",
  ".playwright-mcp",
  ".postgres",
  ".runtime",
  "artifacts",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
  "runtime",
  "sessions",
  "logs",
  "dumps",
  "attachments",
  "projections",
  "maintenance",
  "dist",
  "build",
  ".cache",
]);
const excludedExtensions = new Set([
  "7z",
  "avi",
  "bin",
  "db",
  "dump",
  "gif",
  "gz",
  "ico",
  "jpeg",
  "jpg",
  "key",
  "lockb",
  "log",
  "mov",
  "mp3",
  "mp4",
  "p12",
  "pfx",
  "pdf",
  "pem",
  "png",
  "sqlite",
  "sqlite3",
  "tar",
  "tsbuildinfo",
  "wasm",
  "webm",
  "webp",
  "woff",
  "woff2",
  "xz",
  "zip",
]);

/** Принимает только канонический относительный POSIX путь, без скрытой нормализации. */
export function parseRepositoryPath(value: string, allowRoot = false): string {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > 4096 ||
    (!value && !allowRoot) ||
    /[\x00-\x1f\x7f\\:]/u.test(value) ||
    value.startsWith("/") ||
    (value !== "" &&
      value.split("/").some((part) => !part || part === "." || part === ".."))
  )
    throw new RepositoryReadError(
      "INVALID_INPUT",
      "Требуется относительный POSIX путь.",
    );
  return value;
}

/** Политика одинакова для рабочего дерева и исторических Git blobs. */
export function isRepositoryPathAllowed(
  policy: RepositoryReadPolicy,
  path: string,
): boolean {
  try {
    parseRepositoryPath(path);
  } catch {
    return false;
  }
  const parts = path.split("/");
  if (
    !policy.developerInstructions &&
    ["AGENTS.md", ".ai", ".codex"].includes(parts[0])
  )
    return false;
  if (
    parts.length === 1 &&
    !REPOSITORY_ROOT_FILES.includes(path) &&
    !REPOSITORY_ROOT_DIRECTORIES.includes(path)
  )
    return false;
  if (parts.length > 1 && !REPOSITORY_ROOT_DIRECTORIES.includes(parts[0]))
    return false;
  if (
    parts.some((part, index) => {
      const name = part.toLowerCase();
      // В scripts/runtime находятся исходники; runtime state исключается внутри agent tooling.
      if (name === "runtime")
        return parts[0] === ".ai" || parts[0] === ".codex";
      if (name === "maintenance")
        return parts[0] === ".ai" && parts[1] === "tools";
      return (
        excludedSegments.has(name) ||
        name.startsWith(".env") ||
        name === "auth.json" ||
        name === "auth.jsonl" ||
        name.includes("credentials") ||
        /(?:^|[._-])(?:secret|secrets|token|tokens|private-key)(?:[._-]|$)/u.test(
          name,
        ) ||
        ((parts[0] === ".codex" || parts[0] === ".ai") &&
          ["history.jsonl", "config.local.toml", "profiles"].includes(name)) ||
        (index === parts.length - 1 &&
          excludedExtensions.has(name.split(".").at(-1) ?? ""))
      );
    })
  )
    return false;
  return (
    path !== "src/payload-types.ts" &&
    path !== "src/app/(payload)/admin/importMap.js"
  );
}

/** Разрешённый root канонизируется один раз при сборке сервера. */
export async function createRepositoryReadPolicy(
  root: string,
  developerInstructions: boolean,
): Promise<RepositoryReadPolicy> {
  const canonicalRoot = await realpath(resolve(root));
  const stat = await lstat(canonicalRoot);
  if (!stat.isDirectory())
    throw new RepositoryReadError(
      "INVALID_INPUT",
      "Корень должен быть каталогом.",
    );
  return {
    root: canonicalRoot,
    device: stat.dev,
    inode: stat.ino,
    developerInstructions,
    version: `repository-read-2:${developerInstructions ? "developer" : "product"}`,
  };
}
