/**
 * @file scripts/release/release-source-inventory.mjs
 * @version 1.0.0
 * @date 2026-10-04
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Собирает воспроизводимые версии, миграции и конфигурацию exact checkout.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createMigrationSetHash } from "@realize/change-engine/platform-release";
import { createPlatformSourceInventory } from "./createPlatformSourceInventory.service.ts";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const readJSON = async (path) => JSON.parse(await readFile(path, "utf8"));

const migrationNames = (indexSource) => {
  const names = Array.from(
    indexSource.matchAll(/name:\s*['"]([0-9]{8}_[a-z0-9_]+)['"]/g),
    (match) => match[1],
  );
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new Error("Migration index must contain unique named migrations.");
  }
  return names;
};

const optionalFileHash = async (path) => {
  try {
    return sha256(await readFile(path));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
};

const migrationInventory = async (root) => {
  const directory = resolve(root, "src/migrations");
  const indexSource = await readFile(resolve(directory, "index.ts"), "utf8");
  return await Promise.all(
    migrationNames(indexSource).map(async (id) => {
      const typescriptHash = await optionalFileHash(
        resolve(directory, `${id}.ts`),
      );
      if (!typescriptHash)
        throw new Error(`Migration source is missing: ${id}.ts`);
      const snapshotHash = await optionalFileHash(
        resolve(directory, `${id}.json`),
      );
      return {
        checksum: sha256(
          JSON.stringify([
            ["typescript", typescriptHash],
            ...(snapshotHash ? [["snapshot", snapshotHash]] : []),
          ]),
        ),
        direction: "up",
        id,
      };
    }),
  );
};

const packageName = (path) => {
  const marker = "node_modules/";
  const offset = path.lastIndexOf(marker);
  if (offset < 0) return undefined;
  const parts = path.slice(offset + marker.length).split("/");
  return parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1] || ""}` : parts[0];
};

const pluginInventory = (lockfile) => {
  const versions = new Map();
  for (const [path, value] of Object.entries(lockfile.packages || {})) {
    const name = path.startsWith("packages/") ? value.name : packageName(path);
    if (
      typeof name !== "string" ||
      typeof value.version !== "string" ||
      !(
        name === "payload" ||
        name.startsWith("@payloadcms/") ||
        name.startsWith("@realize/")
      )
    ) {
      continue;
    }
    const previous = versions.get(name);
    if (previous && previous !== value.version) {
      throw new Error(`Plugin ${name} resolves to multiple versions.`);
    }
    versions.set(name, value.version);
  }
  if (versions.size === 0)
    throw new Error("No Payload/Realize plugins were resolved.");
  return Object.fromEntries(
    [...versions.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
};

const configDigest = async (root) => {
  const paths = [
    "package-lock.json",
    "src/payload.config.ts",
    "src/plugins/index.ts",
  ];
  const hashes = await Promise.all(
    paths.map(async (path) => [
      path,
      sha256(await readFile(resolve(root, path))),
    ]),
  );
  return `sha256:${sha256(JSON.stringify(hashes))}`;
};

/** Сохраняет публичное имя и прежний migration-set hash; владелец алгоритма — Change Engine. */
export const createReleaseMigrationSetHash = createMigrationSetHash;

/** Добавляет общий source inventory, сохраняя существующие hashes release candidate. */
export const createReleaseSourceInventory = async (sourceRoot) => {
  const root = resolve(sourceRoot);
  const migrations = await migrationInventory(root);
  const migrationSetHash = createReleaseMigrationSetHash(migrations);
  return {
    configVersion: await configDigest(root),
    migrations,
    migrationSetHash,
    platform: await createPlatformSourceInventory({
      sourceRoot: root,
      migrations,
      migrationSetHash,
    }),
    pluginVersions: pluginInventory(
      await readJSON(resolve(root, "package-lock.json")),
    ),
  };
};
