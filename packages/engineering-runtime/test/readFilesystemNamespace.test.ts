/**
 * @file packages/engineering-runtime/test/readFilesystemNamespace.test.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Проверяет общий cache namespace, отрицательные probes и независимый лимит source inventory.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFilesystemNamespace } from "../src/filesystem/readFilesystemNamespace.service.ts";
import { readFilesystemInventory } from "../src/filesystem/readFilesystemInventory.service.ts";
import type { DescriptorFilesystem } from "../src/filesystem/DescriptorFilesystem.adapter.ts";
import type { ManifestEntry } from "../src/filesystem/EngineeringFilesystem.types.ts";

function fixture(children: ManifestEntry["children"] = []) {
  const observed = new Map<string, ManifestEntry>(),
    calls: string[] = [];
  const entry: ManifestEntry = {
    path: "packages",
    identity: {
      kind: "directory",
      dev: "1",
      ino: "1",
      mode: 0o700,
      size: null,
      sha256: null,
    },
    children,
  };
  const filesystem = {
    entry(path: string) {
      calls.push(path);
      return { ...entry, path };
    },
  } as DescriptorFilesystem;
  const read = (path: string) =>
    readFilesystemNamespace(filesystem, path, observed);
  return { entry, observed, calls, read };
}
test("namespace cache читает один уровень один раз, включая пустой каталог", () => {
  const f = fixture([{ name: "huge", kind: "directory", dev: "1", ino: "2" }]);
  assert.equal(f.read("packages"), f.read("packages"));
  assert.deepEqual(f.calls, ["packages"]);
  assert.equal(f.observed.size, 1);
  const empty = fixture();
  assert.deepEqual(empty.read("empty").children, []);
  empty.read("empty");
  assert.deepEqual(empty.calls, ["empty"]);
});
test("отрицательный namespace probe сохраняется и переиспользуется", () => {
  const f = fixture();
  f.entry.identity = null;
  f.entry.children = null;
  assert.equal(f.read("missing").identity, null);
  assert.equal(f.read("missing").identity, null);
  assert.deepEqual(f.calls, ["missing"]);
  assert.ok(f.observed.has("missing"));
});
test("обычный файл не становится namespace", () => {
  const f = fixture();
  f.entry.identity!.kind = "file";
  assert.throws(() => f.read("file"), { code: "UNSUPPORTED" });
  assert.equal(f.observed.size, 0);
});
test("namespace budget не допускает нового чтения, но сохраняет cache hit", () => {
  const f = fixture();
  for (let i = 0; i < 512; i++) f.read(`p${i}`);
  f.read("p0");
  assert.throws(() => f.read("overflow"), { code: "LIMIT_EXCEEDED" });
  assert.equal(f.calls.length, 512);
});
test("source inventory сохраняет лимит 128 файлов независимо от shallow namespace", () => {
  const f = fixture(
    Array.from({ length: 129 }, (_, i) => ({
      name: `f${i}.ts`,
      kind: "file" as const,
      dev: "1",
      ino: String(i + 2),
    })),
  );
  assert.equal(f.read("src").children!.length, 129);
  assert.throws(() => readFilesystemInventory(f.read, ["src"]), {
    code: "LIMIT_EXCEEDED",
  });
  assert.deepEqual(f.calls, ["src"]);
});
test("recursive source walk и повторные roots используют тот же namespace owner", () => {
  const f = fixture([{ name: "value.ts", kind: "file", dev: "1", ino: "2" }]);
  assert.deepEqual(readFilesystemInventory(f.read, ["src", "src"]), [
    "src/value.ts",
  ]);
  assert.deepEqual(readFilesystemInventory(f.read, ["src"]), ["src/value.ts"]);
  assert.deepEqual(f.calls, ["src"]);
  assert.throws(() => readFilesystemInventory(f.read, []), {
    code: "LIMIT_EXCEEDED",
  });
});
