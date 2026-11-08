// @vitest-environment node
/**
 * @file tests/int/platformSourceInventory.int.spec.ts
 * @version 1.0.2
 * @date 2026-11-05
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
import {
  readReleaseSourceFiles,
  readReleaseWorkspacePackageManifests,
} from "../../scripts/release/readReleaseSourceFiles.adapter";
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
  await mkdir(resolve(root, "packages/alpha"), { recursive: true });
  await mkdir(resolve(root, "scripts/release"), { recursive: true });
  await Promise.all([
    writeFile(resolve(root, "contract.ts"), "export const contract = 1;\n"),
    writeFile(
      resolve(root, "package.json"),
      JSON.stringify({
        name: "fixture-platform",
        version: "1.0.0",
        workspaces: ["packages/*"],
        dependencies: {
          "@realize/alpha": "0.2.0",
          "@realize/example": "0.1.0",
        },
      }),
    ),
    writeFile(
      resolve(root, "packages/alpha/package.json"),
      JSON.stringify({ name: "@realize/alpha", version: "0.2.0" }),
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
          "packages/alpha": { name: "@realize/alpha", version: "0.2.0" },
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
    const packageSource = "export const packageSource = true;\n";
    await mkdir(resolve(input.sourceRoot, "packages/example/src"), {
      recursive: true,
    });
    await writeFile(
      resolve(input.sourceRoot, "packages/example/src/index.ts"),
      packageSource,
    );
    const before = await createPlatformSourceInventory(input);
    const repeat = await createPlatformSourceInventory(input);
    expect(repeat).toEqual(before);
    const packageComponent = before.components.find(
      (item) => item.id === "@realize/example",
    );
    expect(packageComponent?.files.map((file) => file.path)).toEqual([
      "packages/example/package.json",
      "packages/example/src/index.ts",
    ]);
    expect(
      packageComponent?.files.find(
        (file) => file.path === "packages/example/src/index.ts",
      )?.sha256,
    ).toBe(createHash("sha256").update(packageSource).digest("hex"));
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

  it("discovers direct workspace manifests deterministically without traversing package sources", async () => {
    const input = await createSourceFixture();
    const outside = resolve(input.sourceRoot, "outside-workspace");
    await mkdir(outside, { recursive: true });
    await writeFile(resolve(outside, "escape.txt"), "outside\n");
    await symlink(
      outside,
      resolve(input.sourceRoot, "packages/example/nested-escape"),
    );

    const manifests = await readReleaseWorkspacePackageManifests(
      input.sourceRoot,
    );
    expect(manifests.map(({ path }) => path)).toEqual([
      "packages/alpha",
      "packages/example",
    ]);
    expect(
      (await readReleaseWorkspacePackageManifests(input.sourceRoot)).map(
        ({ path }) => path,
      ),
    ).toEqual(["packages/alpha", "packages/example"]);
    await expect(createPlatformSourceInventory(input)).rejects.toThrow(
      "symlink",
    );
  });

  it("rejects escaping workspace directories and symlinked package manifests", async () => {
    const input = await createSourceFixture();
    const outside = resolve(input.sourceRoot, "outside-workspace");
    await mkdir(outside, { recursive: true });
    await writeFile(
      resolve(outside, "package.json"),
      JSON.stringify({ name: "@realize/escaped", version: "0.1.0" }),
    );
    const escapedPackage = resolve(input.sourceRoot, "packages/escaped");
    await symlink(outside, escapedPackage);
    await expect(
      readReleaseWorkspacePackageManifests(input.sourceRoot),
    ).rejects.toThrow("symlink");

    await rm(escapedPackage);
    const packageManifest = resolve(
      input.sourceRoot,
      "packages/example/package.json",
    );
    await rm(packageManifest);
    await symlink(resolve(outside, "package.json"), packageManifest);
    await expect(
      readReleaseWorkspacePackageManifests(input.sourceRoot),
    ).rejects.toThrow("symlink");

    await rm(packageManifest);
    await symlink(resolve(outside, "missing-package.json"), packageManifest);
    await expect(
      readReleaseWorkspacePackageManifests(input.sourceRoot),
    ).rejects.toThrow("symlink");
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

  it("preserves exact hashes, bytewise order and overlapping-root dedup across files and directories", async () => {
    const input = await createSourceFixture();
    const sourcePath = "packages/example/src";
    await mkdir(resolve(input.sourceRoot, sourcePath, "nested"), {
      recursive: true,
    });
    await mkdir(resolve(input.sourceRoot, sourcePath, ".cache"));
    await mkdir(resolve(input.sourceRoot, sourcePath, ".next"));
    const sources = [
      ...Array.from({ length: 32 }, (_, index) => ({
        path: `${sourcePath}/file-${String(index).padStart(3, "0")}.ts`,
        text: `export const n = ${index};\n`,
      })),
      ...Array.from({ length: 24 }, (_, index) => ({
        path: `${sourcePath}/directory-${String(index).padStart(3, "0")}/child/deep.ts`,
        text: `export const directory = ${index};\n`,
      })),
      { path: `${sourcePath}/é.ts`, text: "unicode source\n" },
      { path: `${sourcePath}/nested/deep.ts`, text: "nested source\n" },
      {
        path: `${sourcePath}/.cache/source.ts`,
        text: "source cache belongs to inventory\n",
      },
    ];
    await Promise.all(
      sources.map(async ({ path, text }) => {
        await mkdir(resolve(input.sourceRoot, path, ".."), {
          recursive: true,
        });
        await writeFile(resolve(input.sourceRoot, path), text);
      }),
    );
    await writeFile(
      resolve(input.sourceRoot, sourcePath, ".next/generated.ts"),
      "generated",
    );
    const request = {
      sourceRoot: input.sourceRoot,
      paths: [sourcePath, sourcePath, `${sourcePath}/nested`],
    };
    const expected = sources
      .map(({ path, text }) => ({
        path,
        sha256: createHash("sha256").update(text).digest("hex"),
      }))
      .sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      );
    expect(await readReleaseSourceFiles(request)).toEqual(expected);
    expect(await readReleaseSourceFiles(request)).toEqual(expected);
    await writeFile(
      resolve(input.sourceRoot, sourcePath, ".env.local"),
      "fixture-private-value",
    );
    await expect(readReleaseSourceFiles(request)).rejects.toThrow(
      "Secret file",
    );
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
