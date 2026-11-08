/**
 * @file scripts/release/readReleaseSourceFiles.adapter.ts
 * @version 1.1.1
 * @date 2026-11-05
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
const MAX_RELEASE_SOURCE_FILES = 20_000;
const MAX_RELEASE_SOURCE_FILE_BYTES = 32 * 1024 * 1024;
const MAX_RELEASE_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_RELEASE_WORKSPACE_PACKAGE_COUNT = 20_000;

const sourcePath = async (canonicalSourceRoot: string, path: string) => {
  releaseSourcePathSchema.parse(path);
  if (
    path
      .split("/")
      .some((part) => part.startsWith(".env") || /\.(pem|key)$/i.test(part))
  ) {
    throw new Error("Secret file paths are not release source artifacts");
  }
  const candidate = resolve(canonicalSourceRoot, path);
  if (
    !candidate.startsWith(`${canonicalSourceRoot}${sep}`) ||
    (await realpath(candidate)) !== candidate
  ) {
    throw new Error(`Release source path must not traverse a symlink: ${path}`);
  }
  return candidate;
};

const isMissingPathError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ENOENT";

/** JSON читается только как данные; candidate code никогда не исполняется для inventory. */
export const readReleaseSourceJSON = async (
  sourceRoot: string,
  path: string,
): Promise<unknown> => {
  const canonicalSourceRoot = await realpath(sourceRoot);
  const absolute = await sourcePath(canonicalSourceRoot, path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.size > MAX_RELEASE_SOURCE_FILE_BYTES)
    throw new Error(`Invalid source JSON size: ${path}`);
  return JSON.parse(await readFile(absolute, "utf8"));
};

/** Читает манифесты только непосредственных workspace-пакетов, не сканируя их исходные деревья. */
export const readReleaseWorkspacePackageManifests = async (
  sourceRoot: string,
) => {
  const canonicalSourceRoot = await realpath(sourceRoot);
  const packagesRoot = await sourcePath(canonicalSourceRoot, "packages");
  const packagesRootStat = await lstat(packagesRoot);
  if (packagesRootStat.isSymbolicLink() || !packagesRootStat.isDirectory())
    throw new Error("Release workspace root is not a directory: packages");

  const packageNames = (await readdir(packagesRoot)).sort();
  if (packageNames.length > MAX_RELEASE_WORKSPACE_PACKAGE_COUNT)
    throw new Error("Release workspace package count exceeds its read budget");

  const manifests: Array<{ path: string; manifest: unknown }> = [];
  let bytesRead = 0;
  for (const name of packageNames) {
    if (EXCLUDED_DIRECTORIES.has(name)) continue;

    const packagePath = `packages/${name}`;
    const absolutePackagePath = await sourcePath(
      canonicalSourceRoot,
      packagePath,
    );
    const packageStat = await lstat(absolutePackagePath);
    if (packageStat.isSymbolicLink())
      throw new Error(
        `Release workspace path must not be a symlink: ${packagePath}`,
      );
    if (!packageStat.isDirectory()) continue;

    const manifestPath = `${packagePath}/package.json`;
    releaseSourcePathSchema.parse(manifestPath);
    const manifestCandidate = resolve(canonicalSourceRoot, manifestPath);
    const manifestStat = await lstat(manifestCandidate).catch(
      (error: unknown) => {
        if (isMissingPathError(error)) return null;
        throw error;
      },
    );
    if (!manifestStat) continue;
    if (manifestStat.isSymbolicLink())
      throw new Error(
        `Release workspace manifest must not be a symlink: ${manifestPath}`,
      );
    const absoluteManifest = await sourcePath(
      canonicalSourceRoot,
      manifestPath,
    );
    if (!manifestStat.isFile())
      throw new Error(
        `Release workspace manifest is not a regular file: ${manifestPath}`,
      );
    bytesRead += manifestStat.size;
    if (
      manifestStat.size > MAX_RELEASE_SOURCE_FILE_BYTES ||
      bytesRead > MAX_RELEASE_SOURCE_BYTES
    ) {
      throw new Error("Release workspace manifests exceed their read budget");
    }
    manifests.push({
      path: packagePath,
      manifest: JSON.parse(await readFile(absoluteManifest, "utf8")) as unknown,
    });
  }
  return manifests;
};

/** Хеширует exact bytes; пути сортируются побайтово, повтор roots не дублируют артефакты. */
export const readReleaseSourceFiles = async (
  input: ReleaseSourceFilesInput,
) => {
  const canonicalSourceRoot = await realpath(input.sourceRoot);
  const files = new Map<string, string>();
  const admittedFiles = new Set<string>();
  const readConcurrency = 8;
  const pending = input.paths.map((path) => ({
    path,
    regularFileExpected: false,
  }));
  let bytesRead = 0;
  const visit = async (
    path: string,
    regularFileExpected = false,
  ): Promise<void> => {
    if (
      EXCLUDED_SOURCE_ROOTS.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      )
    )
      return;
    const absolute = await sourcePath(canonicalSourceRoot, path);
    const stat = await lstat(absolute);
    if (regularFileExpected && !stat.isFile())
      throw new Error(`Release source type changed during inventory: ${path}`);
    if (stat.isDirectory()) {
      const entries = (await readdir(absolute, { withFileTypes: true })).sort(
        (left, right) =>
          left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
      for (const entry of entries)
        if (!EXCLUDED_DIRECTORIES.has(entry.name))
          pending.push({
            path: `${path}/${entry.name}`,
            regularFileExpected: entry.isFile(),
          });
      return;
    }
    if (!stat.isFile())
      throw new Error(`Release source is not a regular file: ${path}`);
    if (admittedFiles.has(path)) return;
    bytesRead += stat.size;
    if (
      admittedFiles.size >= MAX_RELEASE_SOURCE_FILES ||
      stat.size > MAX_RELEASE_SOURCE_FILE_BYTES ||
      bytesRead > MAX_RELEASE_SOURCE_BYTES
    ) {
      throw new Error("Release source inventory exceeds its read budget");
    }
    // Резервирование до await учитывает в общем budget и ещё читаемые файлы.
    admittedFiles.add(path);
    files.set(
      path,
      createHash("sha256")
        .update(await readFile(absolute))
        .digest("hex"),
    );
  };
  for (let next = 0; next < pending.length;) {
    // Общая очередь заполняет группу и файлами из разных каталогов; рекурсия не множит I/O.
    // Каждый visit повторяет realpath/lstat и secret policy; Dirent не является proof.
    const batch = pending.slice(next, next + readConcurrency);
    next += batch.length;
    const results = await Promise.allSettled(
      batch.map(({ path, regularFileExpected }) =>
        visit(path, regularFileExpected),
      ),
    );
    // Все начатые чтения завершаются до возврата ошибки и удаления candidate fixture.
    for (const result of results)
      if (result.status === "rejected") throw result.reason;
  }
  return [...files]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([path, sha256]) => ({ path, sha256 }));
};
