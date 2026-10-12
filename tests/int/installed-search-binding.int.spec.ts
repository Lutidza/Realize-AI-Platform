/**
 * @file tests/int/installed-search-binding.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет actual distDir standalone receipts и отказ до записи при нарушении границ.
 * @see documentation/architecture/repository-search.md
 */
// @vitest-environment node
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readCompiledSearchBinding,
  writeInstalledSearchBinding,
} from "../../.ai/tools/agent-search/src/installedSearchBinding.adapter.mjs";

let root: string;
const sourceVersion = "a".repeat(64);
const installedBuildID = "fixture-build";
const testEnvironment: NodeJS.ProcessEnv = { NODE_ENV: "test" };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "realize-binding-distdir-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function buildFixture(distDir = ".next", relativeAppDir = "") {
  const directory = join(root, distDir);
  const runtimeRoot = join(directory, "standalone", relativeAppDir);
  const runtimeDirectory = join(runtimeRoot, distDir);
  await mkdir(runtimeDirectory, { recursive: true });
  await writeFile(join(directory, "BUILD_ID"), installedBuildID);
  await writeFile(join(runtimeDirectory, "BUILD_ID"), installedBuildID);
  await writeFile(
    join(directory, "required-server-files.json"),
    JSON.stringify({ version: 1, relativeAppDir, config: { distDir } }),
  );
  return {
    directory,
    runtimeRoot,
    runtimeDirectory,
    environment: { ...testEnvironment, REALIZE_NEXT_DIST_DIR: distDir },
  };
}

async function expectNoReceipt(directory: string) {
  const files = await readdir(directory);
  expect(files).not.toContain("realize-search-build.json");
  expect(
    files.filter((file) => file.startsWith(".realize-search-build-")),
  ).toEqual([]);
}

describe("installed search standalone build binding", () => {
  it.each(["", "apps/cms"])(
    "writes default .next receipts for relativeAppDir=%s",
    async (relativeAppDir) => {
      const fixture = await buildFixture(".next", relativeAppDir);
      const binding = await writeInstalledSearchBinding(
        root,
        sourceVersion,
        testEnvironment,
      );
      expect(binding).toMatchObject({ sourceVersion, installedBuildID });
      expect(await readCompiledSearchBinding(root, testEnvironment)).toEqual(
        binding,
      );
      expect(
        await readCompiledSearchBinding(fixture.runtimeRoot, testEnvironment),
      ).toEqual(binding);
    },
  );

  it("writes and reads custom distDir receipts without changing the default build or active pointer", async () => {
    const base = join(root, ".next");
    await mkdir(base);
    await writeFile(join(base, "BUILD_ID"), "existing-build");
    const active = JSON.stringify({ fixture: "existing-active-pointer" });
    await writeFile(join(base, "realize-search-active.json"), active);
    const distDir = ".ai-workspace/tasks/fixture/tmp/next";
    const fixture = await buildFixture(distDir);
    const binding = await writeInstalledSearchBinding(
      root,
      sourceVersion,
      fixture.environment,
    );
    expect(await readCompiledSearchBinding(root, fixture.environment)).toEqual(
      binding,
    );
    expect(
      await readCompiledSearchBinding(fixture.runtimeRoot, fixture.environment),
    ).toEqual(binding);
    expect(await readFile(join(base, "BUILD_ID"), "utf8")).toBe(
      "existing-build",
    );
    expect(
      await readFile(join(base, "realize-search-active.json"), "utf8"),
    ).toBe(active);
    expect((await readdir(base)).sort()).toEqual([
      "BUILD_ID",
      "realize-search-active.json",
    ]);
  });

  it.each([
    null,
    42,
    "",
    ".",
    "..",
    "../outside",
    "/tmp/outside",
    "C:/outside",
    "build\\outside",
    "build/../outside",
    "build/./output",
    "build//output",
    "build\0output",
    "a".repeat(513),
  ])(
    "rejects malformed distDir %# before writing receipts",
    async (distDir) => {
      const fixture = await buildFixture();
      await writeFile(
        join(fixture.directory, "required-server-files.json"),
        JSON.stringify({ relativeAppDir: "", config: { distDir } }),
      );
      await expect(
        writeInstalledSearchBinding(root, sourceVersion, testEnvironment),
      ).rejects.toThrow("search_build_standalone_invalid");
      await expectNoReceipt(fixture.directory);
      await expectNoReceipt(fixture.runtimeDirectory);
    },
  );

  it.each([null, [], "invalid"])(
    "rejects malformed config %# without accepting a default fallback",
    async (config) => {
      const fixture = await buildFixture();
      await writeFile(
        join(fixture.directory, "required-server-files.json"),
        JSON.stringify({ relativeAppDir: "", config }),
      );
      await expect(
        writeInstalledSearchBinding(root, sourceVersion, testEnvironment),
      ).rejects.toThrow("search_build_standalone_invalid");
      await expectNoReceipt(fixture.directory);
    },
  );

  it.each([null, false, []])(
    "rejects malformed required-server metadata %#",
    async (metadata) => {
      const fixture = await buildFixture();
      await writeFile(
        join(fixture.directory, "required-server-files.json"),
        JSON.stringify(metadata),
      );
      await expect(
        writeInstalledSearchBinding(root, sourceVersion, testEnvironment),
      ).rejects.toThrow("search_build_standalone_invalid");
      await expectNoReceipt(fixture.directory);
    },
  );

  it("rejects a runtime BUILD_ID mismatch before either receipt is written", async () => {
    const fixture = await buildFixture();
    await writeFile(
      join(fixture.runtimeDirectory, "BUILD_ID"),
      "different-build",
    );
    await expect(
      writeInstalledSearchBinding(root, sourceVersion, testEnvironment),
    ).rejects.toThrow("search_build_standalone_mismatch");
    await expectNoReceipt(fixture.directory);
    await expectNoReceipt(fixture.runtimeDirectory);
  });

  it("rejects an external directory symlink before reading its missing BUILD_ID or writing outputs", async () => {
    const directory = join(root, ".next");
    const standalone = join(directory, "standalone");
    const outside = join(root, "outside");
    await mkdir(standalone, { recursive: true });
    await mkdir(outside);
    await writeFile(join(directory, "BUILD_ID"), installedBuildID);
    await writeFile(
      join(directory, "required-server-files.json"),
      JSON.stringify({ relativeAppDir: "", config: { distDir: ".next" } }),
    );
    await symlink(outside, join(standalone, ".next"));
    // Если BUILD_ID читался бы до containment check, исходом был бы ENOENT.
    await expect(
      writeInstalledSearchBinding(root, sourceVersion, testEnvironment),
    ).rejects.toThrow("search_build_standalone_invalid");
    await expectNoReceipt(directory);
    expect(await readdir(outside)).toEqual([]);
  });
});
