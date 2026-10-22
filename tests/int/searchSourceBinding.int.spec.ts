/**
 * @file tests/int/searchSourceBinding.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет включение общего Git executor и read policy в source binding с ограниченным обходом.
 * @see documentation/architecture/repository-search.md
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSearchSourceVersion } from "../../.ai/tools/agent-search/src/searchSourceBinding.adapter.mjs";

const fixture = vi.hoisted(() => ({
  root: "/git-binding-fixture",
  contents: new Map<string, string>(),
  directories: new Map<
    string,
    { name: string; kind: "file" | "directory" | "symlink" }[]
  >(),
}));

vi.mock("node:fs/promises", () => {
  const methods = {
    lstat: async (path: string) => ({
      isFile: () => /\.(?:json|ts|tsx|mjs)$/.test(path),
      isDirectory: () => !/\.(?:json|ts|tsx|mjs)$/.test(path),
      isSymbolicLink: () => false,
      size: 64,
    }),
    realpath: async (path: string) => path,
    readFile: async (path: string) =>
      Buffer.from(fixture.contents.get(path) ?? "fixture source"),
    readdir: async (path: string) =>
      (fixture.directories.get(path) ?? []).map(({ name, kind }) => ({
        name,
        isDirectory: () => kind === "directory",
        isSymbolicLink: () => kind === "symlink",
      })),
  };
  return { ...methods, default: methods };
});

beforeEach(() => {
  fixture.contents.clear();
  fixture.directories.clear();
});

describe("Git dependencies in repository source binding", () => {
  it.each(["packages/git-runtime/src", ".ai/tools/git-delivery/src/read"])(
    "учитывает изменение и добавление вложенного source в %s",
    async (owner) => {
      const directory = `${fixture.root}/${owner}`;
      fixture.directories.set(directory, [
        { name: "nested", kind: "directory" },
      ]);
      fixture.directories.set(`${directory}/nested`, [
        { name: "policy.ts", kind: "file" },
      ]);
      const initial = await readSearchSourceVersion(fixture.root);
      expect(await readSearchSourceVersion(fixture.root)).toBe(initial);
      fixture.contents.set(`${directory}/nested/policy.ts`, "changed policy");
      const changed = await readSearchSourceVersion(fixture.root);
      expect(changed).not.toBe(initial);
      fixture.directories.get(`${directory}/nested`)!.push({
        name: "additional.ts",
        kind: "file",
      });
      expect(await readSearchSourceVersion(fixture.root)).not.toBe(changed);
    },
  );

  it.each([
    "packages/git-runtime/package.json",
    ".ai/tools/git-delivery/src/commit/assertNoGitSecrets.validator.ts",
  ])("связывает прямую зависимость %s", async (path) => {
    const initial = await readSearchSourceVersion(fixture.root);
    fixture.contents.set(`${fixture.root}/${path}`, "changed contract");
    expect(await readSearchSourceVersion(fixture.root)).not.toBe(initial);
  });

  it("отклоняет symlink внутри нового Git owner", async () => {
    fixture.directories.set(`${fixture.root}/packages/git-runtime/src`, [
      { name: "outside", kind: "symlink" },
    ]);
    await expect(readSearchSourceVersion(fixture.root)).rejects.toThrow(
      "search_source_binding_limit",
    );
  });

  it("ограничивает глубину и число entries до чтения полного дерева", async () => {
    let directory = `${fixture.root}/packages/git-runtime/src`;
    for (let depth = 0; depth < 9; depth++) {
      fixture.directories.set(directory, [{ name: "next", kind: "directory" }]);
      directory += "/next";
    }
    await expect(readSearchSourceVersion(fixture.root)).rejects.toThrow(
      "search_source_binding_limit",
    );
    fixture.directories.clear();
    fixture.directories.set(
      `${fixture.root}/packages/git-runtime/src`,
      Array.from({ length: 513 }, (_, index) => ({
        name: `source-${index}.ts`,
        kind: "file" as const,
      })),
    );
    await expect(readSearchSourceVersion(fixture.root)).rejects.toThrow(
      "search_source_binding_limit",
    );
  });
});
