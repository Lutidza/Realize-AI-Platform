/**
 * @file services/ai-control-plane/src/contextSnapshot.ts
 * @version 2026-08-17
 * @description Builds a bounded, secret-conscious repository snapshot for one read-only run.
 */

import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

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

type ManifestEntry = {
  bytes: number;
  path: string;
  sha256: string;
};

/** Handle and metrics for a temporary read-only Context Pack. */
export type ContextSnapshot = {
  cleanup: () => Promise<void>;
  fileCount: number;
  root: string;
  totalBytes: number;
};

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

/** Copies the allowlisted repository contour into a bounded temporary directory. */
export const createContextSnapshot = async (
  workspaceRoot: string,
): Promise<ContextSnapshot> => {
  const sourceRoot = resolve(workspaceRoot);
  const destinationRoot = await mkdtemp(join(tmpdir(), "realize-ai-context-"));
  const manifest: ManifestEntry[] = [];
  let totalBytes = 0;

  const copyEntry = async (source: string): Promise<void> => {
    const sourceRelative = relative(sourceRoot, source);
    if (sourceRelative.startsWith(`..${sep}`) || sourceRelative === "..")
      return;
    if (containsSensitiveName(sourceRelative)) return;

    const stats = await lstat(source);
    if (stats.isSymbolicLink()) return;

    if (stats.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(basename(source))) return;
      const destination = join(destinationRoot, sourceRelative);
      await mkdir(destination, { recursive: true, mode: 0o750 });
      const children = await readdir(source);
      for (const child of children.sort()) await copyEntry(join(source, child));
      return;
    }

    if (
      !stats.isFile() ||
      stats.size > MAX_FILE_BYTES ||
      EXCLUDED_EXTENSIONS.has(extension(source))
    ) {
      return;
    }
    if (totalBytes + stats.size > MAX_TOTAL_BYTES) {
      throw new Error("Context Pack exceeds the 50 MiB safety limit.");
    }

    const data = await readFile(source);
    if (data.includes(0)) return;

    const destination = join(destinationRoot, sourceRelative);
    await mkdir(resolve(destination, ".."), { recursive: true, mode: 0o750 });
    await copyFile(source, destination);
    await chmod(destination, 0o440);
    totalBytes += stats.size;
    manifest.push({
      bytes: stats.size,
      path: sourceRelative,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  };

  try {
    for (const file of ROOT_FILES) {
      const source = join(sourceRoot, file);
      try {
        await copyEntry(source);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    for (const directory of ROOT_DIRECTORIES) {
      const source = join(sourceRoot, directory);
      try {
        await copyEntry(source);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    const manifestPath = join(destinationRoot, "CONTEXT_PACK.json");
    await writeFile(
      manifestPath,
      `${JSON.stringify({ files: manifest, schemaVersion: 1, totalBytes }, null, 2)}\n`,
      { mode: 0o440 },
    );

    return {
      cleanup: async () => {
        await chmod(destinationRoot, 0o750);
        await rm(destinationRoot, { force: true, recursive: true });
      },
      fileCount: manifest.length,
      root: destinationRoot,
      totalBytes,
    };
  } catch (error) {
    await rm(destinationRoot, { force: true, recursive: true });
    throw error;
  }
};
