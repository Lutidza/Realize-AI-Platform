/**
 * @file scripts/release/createPlatformSourceInventory.service.ts
 * @version 1.0.1
 * @date 2026-11-05
 * @description Собирает версии пакетов и contract units из exact checkout без исполнения его кода.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { z } from "zod";
import {
  hashCanonicalJSON,
  verifyPlatformSourceInventory,
} from "@realize/change-engine/platform-release";
import type {
  PlatformComponent,
  PlatformSourceInventory,
} from "@realize/ai-contracts/platform-release";
import type { PlatformSourceInventoryInput } from "./PlatformSourceInventory.types.ts";
import {
  platformReleaseCatalogSchema,
  releasePackageSchema,
} from "./platformReleaseCatalog.validator.ts";
import {
  readReleaseWorkspacePackageManifests,
  readReleaseSourceFiles,
  readReleaseSourceJSON,
} from "./readReleaseSourceFiles.adapter.ts";

/** Версии workspace берутся из package.json и сверяются с lock; диапазон не превращается в exact version. */
export const createPlatformSourceInventory = async (
  input: PlatformSourceInventoryInput,
): Promise<PlatformSourceInventory> => {
  const root = releasePackageSchema
    .extend({ workspaces: z.tuple([z.literal("packages/*")]) })
    .parse(await readReleaseSourceJSON(input.sourceRoot, "package.json"));
  const catalog = platformReleaseCatalogSchema.parse(
    await readReleaseSourceJSON(
      input.sourceRoot,
      "scripts/release/platformRelease.config.json",
    ),
  );
  const lock = z
    .object({
      lockfileVersion: z.literal(3),
      packages: z.record(
        z.string(),
        z.object({
          name: z.string().optional(),
          version: z.string().optional(),
          link: z.boolean().optional(),
        }),
      ),
    })
    .parse(await readReleaseSourceJSON(input.sourceRoot, "package-lock.json"));
  if (lock.packages[""]?.version !== root.version)
    throw new Error("Root package version differs from lockfile");
  const workspacePaths = Object.keys(lock.packages)
    .filter((path) => /^packages\/[^/]+$/.test(path))
    .sort();
  if (workspacePaths.length === 0)
    throw new Error("Release has no locked workspace packages");
  const workspaceManifests = await readReleaseWorkspacePackageManifests(
    input.sourceRoot,
  );
  const actualWorkspacePaths = workspaceManifests.map(({ path }) => path);
  if (JSON.stringify(actualWorkspacePaths) !== JSON.stringify(workspacePaths)) {
    throw new Error("Workspace directories differ from lockfile");
  }
  const workspacePackagesByPath = new Map(
    workspaceManifests.map(
      ({ path, manifest }) =>
        [path, releasePackageSchema.parse(manifest)] as const,
    ),
  );
  const components: PlatformComponent[] = [];
  const definitions = [...catalog.components];
  for (const path of workspacePaths) {
    const pkg = workspacePackagesByPath.get(path);
    if (!pkg) throw new Error(`Workspace package manifest is missing: ${path}`);
    if (
      lock.packages[path].version !== pkg.version ||
      lock.packages[path].name !== pkg.name ||
      root.dependencies[pkg.name] !== pkg.version
    ) {
      throw new Error(`Workspace package/lock/root version mismatch: ${path}`);
    }
    for (const [name, dependency] of Object.entries(pkg.dependencies)) {
      if (
        name.startsWith("@realize/") &&
        root.dependencies[name] !== dependency
      ) {
        throw new Error(
          `Workspace dependency version mismatch: ${pkg.name} -> ${name}`,
        );
      }
    }
    definitions.push({
      id: pkg.name,
      kind: "core-package",
      packagePath: `${path}/package.json`,
      sources: [path],
    });
  }
  for (const definition of definitions) {
    const version = definition.packagePath
      ? releasePackageSchema.parse(
          await readReleaseSourceJSON(input.sourceRoot, definition.packagePath),
        ).version
      : definition.version!;
    const files = await readReleaseSourceFiles({
      sourceRoot: input.sourceRoot,
      paths: definition.sources,
    });
    components.push({
      id: definition.id,
      kind: definition.kind,
      owner: "platform-owner",
      version,
      files,
      sha256: hashCanonicalJSON(files),
    });
  }
  components.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  return verifyPlatformSourceInventory({
    schemaVersion: 1,
    platformVersion: root.version,
    components,
    unavailable: catalog.unavailable,
    schema: {
      migrations: input.migrations,
      migrationSetHash: input.migrationSetHash,
      migrationOrderHash: hashCanonicalJSON(input.migrations),
      recovery: "separate-database-plan-required",
    },
    compatibility: {
      mode: "exact-component-set",
      extensionPoints: catalog.extensionPoints,
    },
    support: catalog.support,
  });
};
