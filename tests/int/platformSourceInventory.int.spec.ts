/**
 * @file tests/int/platformSourceInventory.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Проверяет filesystem drift, обходы путей и штатный Node CLI manifest без Git/network.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMigrationSetHash,
  verifyPlatformSourceInventory,
} from "@realize/change-engine/platform-release";
import { createPlatformSourceInventory } from "../../scripts/release/createPlatformSourceInventory.service";
import { readReleaseSourceFiles } from "../../scripts/release/readReleaseSourceFiles.adapter";
import {
  installedPlatformFixture,
  platformReleaseEnvironment,
} from "./support/platformRelease.fixture";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const createSourceFixture = async () => {
  const root = await mkdtemp(resolve(tmpdir(), "platform-inventory-"));
  roots.push(root);
  const catalog = JSON.parse(
    await readFile("scripts/release/platformRelease.config.json", "utf8"),
  );
  catalog.components = catalog.components.map(
    (component: { id: string; kind: string }) => ({
      id: component.id,
      kind: component.kind,
      version: "1.0.0",
      sources: ["contract.ts"],
    }),
  );
  catalog.extensionPoints = [];
  await mkdir(resolve(root, "packages/example"), { recursive: true });
  await mkdir(resolve(root, "scripts/release"), { recursive: true });
  await Promise.all([
    writeFile(resolve(root, "contract.ts"), "export const contract = 1;\n"),
    writeFile(
      resolve(root, "package.json"),
      JSON.stringify({
        name: "fixture-platform",
        version: "1.0.0",
        workspaces: ["packages/*"],
        dependencies: { "@realize/example": "0.1.0" },
      }),
    ),
    writeFile(
      resolve(root, "packages/example/package.json"),
      JSON.stringify({ name: "@realize/example", version: "0.1.0" }),
    ),
    writeFile(
      resolve(root, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { version: "1.0.0" },
          "packages/example": { name: "@realize/example", version: "0.1.0" },
        },
      }),
    ),
    writeFile(
      resolve(root, "scripts/release/platformRelease.config.json"),
      JSON.stringify(catalog),
    ),
  ]);
  const migrations = [
    {
      id: "20261004_initial",
      checksum: "1".repeat(64),
      direction: "up" as const,
    },
  ];
  return {
    sourceRoot: root,
    migrations,
    migrationSetHash: createMigrationSetHash(migrations),
  };
};

describe("platform source inventory adapters", () => {
  it("changes component content identity when source bytes change at the same declared version", async () => {
    const input = await createSourceFixture();
    const before = await createPlatformSourceInventory(input);
    const repeat = await createPlatformSourceInventory(input);
    expect(repeat).toEqual(before);
    await writeFile(
      resolve(input.sourceRoot, "contract.ts"),
      "export const contract = 2;\n",
    );
    const after = await createPlatformSourceInventory(input);
    const select = (inventory: typeof before) =>
      inventory.components.find((item) => item.id === "realize-platform")!;
    expect(select(after).version).toBe(select(before).version);
    expect(select(after).sha256).not.toBe(select(before).sha256);
    expect(select(after).files[0].sha256).toBe(
      createHash("sha256").update("export const contract = 2;\n").digest("hex"),
    );
  });

  it("rejects package/lock drift and an unregistered workspace", async () => {
    const input = await createSourceFixture();
    const packagePath = resolve(
      input.sourceRoot,
      "packages/example/package.json",
    );
    await writeFile(
      packagePath,
      JSON.stringify({ name: "@realize/example", version: "0.2.0" }),
    );
    await expect(createPlatformSourceInventory(input)).rejects.toThrow(
      "version mismatch",
    );
    await writeFile(
      packagePath,
      JSON.stringify({ name: "@realize/example", version: "0.1.0" }),
    );
    await mkdir(resolve(input.sourceRoot, "packages/unlocked"));
    await writeFile(
      resolve(input.sourceRoot, "packages/unlocked/package.json"),
      JSON.stringify({ name: "@realize/unlocked", version: "0.1.0" }),
    );
    await expect(createPlatformSourceInventory(input)).rejects.toThrow(
      "directories differ",
    );
  });

  it("does not follow source symlinks, traversal or secret files", async () => {
    const input = await createSourceFixture();
    await symlink(
      resolve(input.sourceRoot, "contract.ts"),
      resolve(input.sourceRoot, "linked.ts"),
    );
    await expect(
      readReleaseSourceFiles({
        sourceRoot: input.sourceRoot,
        paths: ["linked.ts"],
      }),
    ).rejects.toThrow("symlink");
    await expect(
      readReleaseSourceFiles({
        sourceRoot: input.sourceRoot,
        paths: ["../contract.ts"],
      }),
    ).rejects.toThrow("traversal");
    await expect(
      readReleaseSourceFiles({ sourceRoot: input.sourceRoot, paths: [".env"] }),
    ).rejects.toThrow("Secret file");
    await symlink(
      resolve(input.sourceRoot, "packages"),
      resolve(input.sourceRoot, "alias"),
    );
    await expect(
      readReleaseSourceFiles({
        sourceRoot: input.sourceRoot,
        paths: ["alias/example/package.json"],
      }),
    ).rejects.toThrow("symlink");
  });

  it("fails closed when a declared artifact is missing", async () => {
    const input = await createSourceFixture();
    await rm(resolve(input.sourceRoot, "contract.ts"));
    await expect(createPlatformSourceInventory(input)).rejects.toThrow();
  });

  it("runs the real CLI under native Node and writes a verifiable manifest with legacy handoff fields", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "platform-cli-"));
    roots.push(root);
    const output = resolve(root, "manifest.json");
    const stdout = execFileSync(
      process.execPath,
      ["scripts/release/create-release-manifest.mjs", output],
      {
        cwd: process.cwd(),
        env: { ...process.env, ...platformReleaseEnvironment },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    const manifest = JSON.parse(await readFile(output, "utf8"));
    expect(stdout).toContain(manifest.platform.manifestHash);
    expect(manifest.gitSha).toBe(manifest.platform.source.commit);
    expect(manifest.image).toBe(manifest.platform.artifact.reference);
    expect(
      verifyPlatformSourceInventory(manifest.platform.inventory).components
        .length,
    ).toBeGreaterThan(10);
    const sources = manifest.platform.inventory.components.flatMap(
      (component: { files: { path: string }[] }) =>
        component.files.map((file) => file.path),
    );
    expect(sources).not.toContain(".codex/config.toml");
    const installedPath = resolve(root, "installed.json");
    const evidencePath = resolve(root, "compatibility.json");
    await writeFile(
      installedPath,
      JSON.stringify(installedPlatformFixture(manifest.platform)),
    );
    execFileSync(
      process.execPath,
      [
        "scripts/release/verifyPlatformInstallation.controller.mjs",
        output,
        installedPath,
        manifest.platform.manifestHash,
        "101",
        "development",
        evidencePath,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 10000 },
    );
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    expect(evidence.compatible).toBe(true);
    expect(evidence.manifestHash).toBe(manifest.platform.manifestHash);
  }, 35000);
});
