/**
 * @file .ai/tools/agent-search/test/installedSearchBinding.test.mjs
 * @version 1.1.0
 * @date 2026-09-30
 * @description Проверяет реальное BUILD_ID, атомарный manifest, границы чтения и отказ от stale source binding.
 * @see documentation/architecture/repository-search.md
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activateInstalledSearchBinding,
  readCompiledSearchBinding,
  readInstalledSearchBinding,
  writeInstalledSearchBinding,
} from "../src/installedSearchBinding.adapter.mjs";

const sourceVersion = "a".repeat(64);
test("activation выбирает проверенный отдельный bundle и сохраняет прежний BUILD_ID", () =>
  fixture(async (root, directory) => {
    await writeInstalledSearchBinding(root, sourceVersion, {});
    const candidate = join(directory, "search-runtime/.next");
    await mkdir(candidate, { recursive: true });
    await writeFile(join(candidate, "BUILD_ID"), "candidate-build");
    const binding = await writeInstalledSearchBinding(root, sourceVersion, {
      REALIZE_NEXT_DIST_DIR: candidate,
    });
    await activateInstalledSearchBinding(
      root,
      candidate,
      sourceVersion,
      binding,
    );
    assert.deepEqual(
      await readInstalledSearchBinding(root, sourceVersion, {}),
      binding,
    );
    assert.equal(
      (await readFile(join(directory, "BUILD_ID"), "utf8")).trim(),
      "actual-build",
    );
    await assert.rejects(
      activateInstalledSearchBinding(root, candidate, sourceVersion, {
        ...binding,
        installedBuildID: "other-running-web",
      }),
      /active_binding_mismatch/,
    );
    assert.deepEqual(
      await readInstalledSearchBinding(root, sourceVersion, {}),
      binding,
    );
    await writeFile(join(candidate, "BUILD_ID"), "changed-build");
    assert.equal(
      await readInstalledSearchBinding(root, sourceVersion, {}),
      undefined,
    );
  }));
test("activation pointer отклоняет malformed, traversal и symlink вне .next", () =>
  fixture(async (root, directory) => {
    const binding = await writeInstalledSearchBinding(root, sourceVersion, {});
    const outside = join(root, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "BUILD_ID"), binding.installedBuildID);
    await writeInstalledSearchBinding(root, sourceVersion, {
      REALIZE_NEXT_DIST_DIR: outside,
    });
    await symlink(outside, join(directory, "outside"), "dir");
    await assert.rejects(
      activateInstalledSearchBinding(root, outside, sourceVersion, binding),
      /active_binding_scope/,
    );
    for (const active of [
      null,
      [],
      {
        directory: ".next/../outside",
        sourceVersion,
        installedBuildID: binding.installedBuildID,
      },
      {
        directory: ".next/./outside",
        sourceVersion,
        installedBuildID: binding.installedBuildID,
      },
      {
        directory: ".next/\\outside",
        sourceVersion,
        installedBuildID: binding.installedBuildID,
      },
      {
        directory: ".next/outside",
        sourceVersion,
        installedBuildID: binding.installedBuildID,
      },
    ]) {
      await writeFile(
        join(directory, "realize-search-active.json"),
        JSON.stringify(active),
      );
      assert.equal(
        await readInstalledSearchBinding(root, sourceVersion, {}),
        undefined,
      );
    }
  }));
test("writer переносит receipt в actual standalone .next и health читает его без source scan", () =>
  fixture(async (root, directory) => {
    const runtimeRoot = join(directory, "standalone/app");
    await mkdir(join(runtimeRoot, ".next"), { recursive: true });
    await writeFile(
      join(directory, "required-server-files.json"),
      JSON.stringify({ relativeAppDir: "app" }),
    );
    await writeFile(join(runtimeRoot, ".next/BUILD_ID"), "actual-build");
    const binding = await writeInstalledSearchBinding(root, sourceVersion, {});
    assert.deepEqual(await readCompiledSearchBinding(runtimeRoot, {}), binding);
  }));
test("чужой standalone BUILD_ID не получает новый manifest", () =>
  fixture(async (root, directory) => {
    const runtimeRoot = join(directory, "standalone/app");
    await mkdir(join(runtimeRoot, ".next"), { recursive: true });
    await writeFile(
      join(directory, "required-server-files.json"),
      JSON.stringify({ relativeAppDir: "app" }),
    );
    await writeFile(join(runtimeRoot, ".next/BUILD_ID"), "other-build");
    await assert.rejects(
      writeInstalledSearchBinding(root, sourceVersion, {}),
      /standalone_mismatch/,
    );
    assert.equal(await readCompiledSearchBinding(root, {}), undefined);
  }));
async function fixture(action) {
  const root = await mkdtemp(join(tmpdir(), "realize-search-binding-"));
  try {
    const directory = join(root, ".next");
    await mkdir(directory);
    await writeFile(join(directory, "BUILD_ID"), "actual-build\n");
    await action(root, directory);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("manifest binds actual generated BUILD_ID and leaves no temporary files", () =>
  fixture(async (root, directory) => {
    const binding = await writeInstalledSearchBinding(root, sourceVersion, {});
    assert.equal(binding.installedBuildID, "actual-build");
    assert.deepEqual(
      await readInstalledSearchBinding(root, sourceVersion, {}),
      binding,
    );
    assert.deepEqual((await readdir(directory)).sort(), [
      "BUILD_ID",
      "realize-search-build.json",
    ]);
  }));
test("missing, stale sources and different compiled build never appear installed", () =>
  fixture(async (root, directory) => {
    assert.equal(
      await readInstalledSearchBinding(root, sourceVersion, {}),
      undefined,
    );
    await writeInstalledSearchBinding(root, sourceVersion, {});
    assert.equal(
      await readInstalledSearchBinding(root, "b".repeat(64), {}),
      undefined,
    );
    await writeFile(join(directory, "BUILD_ID"), "another-build");
    assert.equal(
      await readInstalledSearchBinding(root, sourceVersion, {}),
      undefined,
    );
  }));
test("invalid and oversized manifest are rejected", () =>
  fixture(async (root, directory) => {
    const binding = await writeInstalledSearchBinding(root, sourceVersion, {});
    for (const text of [
      JSON.stringify({ ...binding, unexpected: true }),
      "{",
      " ".repeat(4097),
    ]) {
      await writeFile(join(directory, "realize-search-build.json"), text);
      assert.equal(
        await readInstalledSearchBinding(root, sourceVersion, {}),
        undefined,
      );
    }
  }));
test("manifest file symlinks are rejected but owner-selected canonical build directory works", () =>
  fixture(async (root, directory) => {
    await writeInstalledSearchBinding(root, sourceVersion, {});
    const data = await readFile(join(directory, "realize-search-build.json"));
    const external = join(root, "other-manifest.json");
    await writeFile(external, data);
    await rm(join(directory, "realize-search-build.json"));
    await symlink(external, join(directory, "realize-search-build.json"));
    assert.equal(
      await readInstalledSearchBinding(root, sourceVersion, {}),
      undefined,
    );
    await rm(join(directory, "realize-search-build.json"));
    await symlink(directory, join(root, "candidate"), "dir");
    await writeInstalledSearchBinding(root, sourceVersion, {
      REALIZE_NEXT_DIST_DIR: "candidate",
    });
    assert.equal(
      (
        await readInstalledSearchBinding(root, sourceVersion, {
          REALIZE_NEXT_DIST_DIR: "candidate",
        })
      ).installedBuildID,
      "actual-build",
    );
  }));
