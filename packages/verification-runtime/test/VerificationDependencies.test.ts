/**
 * @file packages/verification-runtime/test/VerificationDependencies.test.ts
 * @version 1.0.1
 * @date 2026-11-07
 * @description Проверяет порядок metadata digest, повторное чтение файлов и границы symlink при пакетном inventory.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { readVerificationDependencySnapshot } from "../src/hashVerificationDependencies.adapter.ts";
import { hashVerificationValue } from "../src/hashVerificationRecipe.util.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "realize-dependency-inventory-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const modules = join(root, "node_modules");
  await mkdir(modules);
  const files = Array.from(
    { length: 48 },
    (_, index) => `file-${String(index).padStart(3, "0")}.js`,
  );
  for (const name of files)
    await writeFile(join(modules, name), "module.exports=1");
  return { root, modules, files };
}

// Перечень ожидаемых paths задан сценарием; helper только формирует строку metadata контракта.
async function metadataRow(path: string, name: string) {
  const stat = await lstat(path, { bigint: true });
  return stat.isDirectory()
    ? [
        name,
        "directory",
        stat.dev.toString(),
        stat.ino.toString(),
        stat.mode.toString(),
      ]
    : [
        name,
        stat.dev.toString(),
        stat.ino.toString(),
        stat.ctimeNs.toString(),
        stat.mtimeNs.toString(),
        stat.size.toString(),
        stat.mode.toString(),
      ];
}

test("wide inventories retain exact ordered digest, hidden lock, caches and duplicate workspace links", async (t) => {
  const f = await fixture(t);
  const lock = '{"lockfileVersion":3}\n';
  await writeFile(join(f.modules, ".package-lock.json"), lock);
  for (const cache of [".cache", ".vite", ".vite-temp"]) {
    await mkdir(join(f.modules, cache));
    await writeFile(join(f.modules, cache, "ignored"), "generated");
  }
  await mkdir(join(f.modules, "a-directory"));
  await writeFile(join(f.modules, "a-directory", "nested.js"), "nested");
  const directories = Array.from(
    { length: 18 },
    (_, index) => `b-directory-${String(index).padStart(2, "0")}`,
  );
  for (const name of directories) {
    await mkdir(join(f.modules, name, "inner"), { recursive: true });
    await writeFile(join(f.modules, name, "inner", "leaf.js"), "nested leaf");
  }
  const linked = join(f.root, "packages", "linked");
  await mkdir(linked, { recursive: true });
  await writeFile(join(linked, "index.js"), "export default 1");
  await writeFile(join(linked, "package.json"), '{"name":"linked"}');
  for (const name of ["z-linked", "zz-linked"])
    await symlink("../packages/linked", join(f.modules, name));
  const unicodeFiles = ["é.js", "中.js", "😀.js"];
  for (const name of unicodeFiles)
    await writeFile(join(f.modules, name), "unicode");

  const expected = [
    await metadataRow(f.modules, "node_modules"),
    await metadataRow(
      join(f.modules, ".package-lock.json"),
      "node_modules/.package-lock.json",
    ),
    [
      "node_modules/.package-lock.json",
      "sha256",
      createHash("sha256").update(lock).digest("hex"),
    ],
    await metadataRow(
      join(f.modules, "a-directory"),
      "node_modules/a-directory",
    ),
    await metadataRow(
      join(f.modules, "a-directory", "nested.js"),
      "node_modules/a-directory/nested.js",
    ),
    ...(
      await Promise.all(
        directories.map(async (name) => [
          await metadataRow(join(f.modules, name), `node_modules/${name}`),
          await metadataRow(
            join(f.modules, name, "inner"),
            `node_modules/${name}/inner`,
          ),
          await metadataRow(
            join(f.modules, name, "inner", "leaf.js"),
            `node_modules/${name}/inner/leaf.js`,
          ),
        ]),
      )
    ).flat(),
    ...(await Promise.all(
      f.files.map((name) =>
        metadataRow(join(f.modules, name), `node_modules/${name}`),
      ),
    )),
    await metadataRow(join(f.modules, "z-linked"), "node_modules/z-linked"),
    [
      "node_modules/z-linked",
      "symlink",
      "../packages/linked",
      "packages/linked",
    ],
    await metadataRow(linked, "workspace:packages/linked"),
    await metadataRow(
      join(linked, "index.js"),
      "workspace:packages/linked/index.js",
    ),
    await metadataRow(
      join(linked, "package.json"),
      "workspace:packages/linked/package.json",
    ),
    await metadataRow(join(f.modules, "zz-linked"), "node_modules/zz-linked"),
    [
      "node_modules/zz-linked",
      "symlink",
      "../packages/linked",
      "packages/linked",
    ],
    ...(await Promise.all(
      unicodeFiles.map((name) =>
        metadataRow(join(f.modules, name), `node_modules/${name}`),
      ),
    )),
  ];
  const expectedSnapshot = {
    digest: hashVerificationValue(expected),
    workspaceInputs: ["packages/linked"],
    entries:
      expected.filter((row) => row[1] !== "sha256" && row[1] !== "symlink")
        .length + 3,
    bytes: Buffer.byteLength(lock),
  };
  for (let attempt = 0; attempt < 3; attempt++)
    assert.deepEqual(
      await readVerificationDependencySnapshot(f.root),
      expectedSnapshot,
    );
});

test("every inventory detects same-size file and hidden-lock edits with restored mtime", async (t) => {
  const f = await fixture(t);
  const dependency = join(f.modules, f.files[24]);
  const lock = join(f.modules, ".package-lock.json");
  const nestedDirectory = join(f.modules, "a-directory");
  await mkdir(nestedDirectory);
  const nested = join(nestedDirectory, "nested.js");
  await writeFile(nested, "initial");
  await writeFile(lock, '{"value":1}');
  const originalTime = new Date("2020-01-01T00:00:00.000Z");
  await utimes(dependency, originalTime, originalTime);
  await utimes(lock, originalTime, originalTime);
  await utimes(nested, originalTime, originalTime);
  const before = await readVerificationDependencySnapshot(f.root);
  await writeFile(dependency, "module.exports=2");
  await utimes(dependency, originalTime, originalTime);
  const changedFile = await readVerificationDependencySnapshot(f.root);
  assert.notEqual(changedFile.digest, before.digest);
  await writeFile(lock, '{"value":2}');
  await utimes(lock, originalTime, originalTime);
  const changedLock = await readVerificationDependencySnapshot(f.root);
  assert.notEqual(changedLock.digest, changedFile.digest);
  assert.equal(changedLock.entries, before.entries);
  assert.equal(changedLock.bytes, before.bytes);
  await writeFile(nested, "changed");
  await utimes(nested, originalTime, originalTime);
  const changedNested = await readVerificationDependencySnapshot(f.root);
  assert.notEqual(changedNested.digest, changedLock.digest);
  assert.equal(changedNested.entries, before.entries);
});

test("a symlink among ordinary file siblings still rejects an external target", async (t) => {
  const f = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), "realize-dependency-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, "external.js"), "external");
  await symlink(outside, join(f.modules, "file-016-link.js"));
  await assert.rejects(readVerificationDependencySnapshot(f.root), {
    code: "verification_dependencies_unsafe",
  });
});
