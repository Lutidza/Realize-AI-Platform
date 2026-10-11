#!/usr/bin/env node
/**
 * @file scripts/release/verifyPlatformInstallation.controller.mjs
 * @version 1.0.0
 * @date 2026-10-04
 * @description Записывает evidence сравнения выпуска и установки без изменения клиентского проекта.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { lstat, readFile, writeFile } from "node:fs/promises";
import { comparePlatformInstallation } from "@realize/change-engine/platform-release";

const readInput = async (path) => {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) {
    throw new Error("Input must be a regular JSON file of at most 8 MiB");
  }
  return JSON.parse(await readFile(path, "utf8"));
};

try {
  const [
    manifestPath,
    installedPath,
    expectedManifestHash,
    expectedPlatformRepositoryId,
    audience,
    outputPath,
    ...extra
  ] = process.argv.slice(2);
  if (
    !manifestPath ||
    !installedPath ||
    !expectedManifestHash ||
    !expectedPlatformRepositoryId ||
    !["development", "external"].includes(audience) ||
    extra.length > 0
  ) {
    throw new Error(
      "Usage: verifyPlatformInstallation.controller.mjs <manifest.json> <installed.json> <trusted-manifest-hash> <platform-repository-id> <development|external> [new-evidence.json]",
    );
  }
  const [release, installed] = await Promise.all([
    readInput(manifestPath),
    readInput(installedPath),
  ]);
  const evidence = comparePlatformInstallation({
    manifest: release.platform ?? release,
    installed,
    expectedManifestHash,
    expectedPlatformRepositoryId,
    audience,
    checkedAt: new Date().toISOString(),
  });
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  // Существующее evidence не перезаписывается: повтор получает отдельный путь и timestamp.
  if (outputPath)
    await writeFile(outputPath, serialized, { flag: "wx", mode: 0o640 });
  process.stdout.write(serialized);
  process.exitCode = evidence.compatible ? 0 : 2;
} catch (error) {
  process.stderr.write(
    `[platform-compatibility] ${error instanceof Error ? error.message : "Invalid compatibility input"}\n`,
  );
  process.exitCode = 1;
}
