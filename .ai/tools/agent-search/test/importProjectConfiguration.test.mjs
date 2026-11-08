/**
 * @file .ai/tools/agent-search/test/importProjectConfiguration.test.mjs
 * @version 1.0.0
 * @date 2026-10-30
 * @description Проверяет exact config selection, cache/ACL и native root selectors на закрытом inventory.
 * @see documentation/architecture/repository-search.md
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { createImportReadContextSync } from "../src/createImportReadContext.service.mjs";
import {
  loadImportConfiguration,
  loadImportConfigurationSync,
} from "../src/loadImportConfiguration.service.mjs";
import { loadImportProjectFilesSync } from "../src/loadImportProjectFiles.service.mjs";
import {
  resolveModulePath,
  resolveModulePathSync,
} from "../src/resolveModulePath.service.mjs";

const configPath = "config/build.json";
function fixture(extra = {}, denied = []) {
  const texts = {
    "tsconfig.json":
      '{"compilerOptions":{"baseUrl":".","paths":{"@value":["src/value.util"]}}}',
    [configPath]:
      '{"extends":"../tsconfig","compilerOptions":{"paths":{"@value":["src/other.util"]}},"include":["../src/**/*"]}',
    "src/main.util.ts": 'import { value } from "@value";',
    "src/value.util.ts": "export const value = 1;",
    "src/other.util.ts": "export const value = 2;",
    ...extra,
  };
  const reads = new Map();
  const context = createImportReadContextSync({
    isAllowed: (path) => !denied.includes(path),
    read(path, options) {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      if (!Object.hasOwn(texts, path)) return { status: "not_found" };
      const text = texts[path];
      if (Buffer.byteLength(text) > options.maximumBytes)
        return { status: "file_too_large" };
      options.onReadBytes(Buffer.byteLength(text));
      return { status: "ok", text };
    },
    listDirectories: () => {
      throw new Error("Host traversal is forbidden");
    },
  });
  const files = new Set(
    Object.keys(texts).filter((path) => !path.endsWith(".json")),
  );
  return { texts, reads, context, files };
}

test("explicit/nearest cache не смешиваются; sync/async используют тот же config и ACL reader", async () => {
  const f = fixture();
  assert.equal(
    resolveModulePathSync(f.context, "src/main.util.ts", "@value").path,
    "src/value.util.ts",
  );
  assert.equal(
    resolveModulePathSync(
      f.context,
      "src/main.util.ts",
      "@value",
      "import",
      "relocation",
      configPath,
    ).path,
    "src/other.util.ts",
  );
  assert.equal(
    (
      await resolveModulePath(
        f.context,
        "src/main.util.ts",
        "@value",
        "import",
        configPath,
      )
    ).path,
    "src/other.util.ts",
  );
  assert.equal(
    (await loadImportConfiguration(f.context, "src/main.util.ts", configPath))
      .configuration.path,
    configPath,
  );
  assert.equal(
    loadImportConfigurationSync(f.context, "src/main.util.ts").configuration
      .path,
    "tsconfig.json",
  );
  assert.equal(f.reads.get(configPath), 1);
  assert.equal(f.reads.get("tsconfig.json"), 1);
  assert.equal(
    loadImportConfigurationSync(f.context, "src/main.util.ts", "missing.json")
      .reason,
    "unsupported_configuration",
  );
});

for (const path of [configPath, "tsconfig.json"])
  test(`explicit config denied ${path} не имеет nearest fallback`, () => {
    const f = fixture({}, [path]);
    assert.equal(
      loadImportProjectFilesSync(f.context, configPath, f.files).reason,
      "forbidden",
    );
  });

test("explicit warm selection не обходит отозванный grant и не принимает ключ nearest cache", () => {
  const denied = [],
    f = fixture({}, denied);
  loadImportConfigurationSync(f.context, "src/main.util.ts");
  loadImportConfigurationSync(f.context, "src/main.util.ts", configPath);
  denied.push(configPath);
  assert.equal(
    loadImportConfigurationSync(f.context, "src/main.util.ts", configPath)
      .reason,
    "forbidden",
  );
  assert.equal(
    loadImportConfigurationSync(f.context, "src/main.util.ts", "nearest:src")
      .reason,
    "forbidden",
  );
});

for (const [name, selectors, base] of [
  ["include/exclude", { include: ["../src/**/*"], exclude: ["../src/other*"] }],
  [
    "literal files + include empty",
    { files: ["../src/main.util.ts"], include: [] },
  ],
  ["default include", {}],
  [
    "inherited selectors",
    {},
    { include: ["src/value*"], exclude: ["src/other*"] },
  ],
  [
    "override selectors",
    { include: ["../src/other*"] },
    { include: ["src/value*"] },
  ],
  [
    "files ignores exclude",
    { files: ["../src/main.util.ts"], include: [], exclude: ["../src/**/*"] },
  ],
  [
    "allowJs/outDir",
    {
      include: ["../src/**/*"],
      compilerOptions: { allowJs: true, outDir: "../src/out" },
    },
  ],
])
  test(`root selection совпадает с filesystem TypeScript: ${name}`, (t) => {
    const f = fixture({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: "." },
        ...base,
      }),
      [configPath]: JSON.stringify({ extends: "../tsconfig", ...selectors }),
      "config/entry.util.ts": "export {};",
      "src/extra.service.js": "export {};",
      "src/out/output.util.ts": "export {};",
    });
    const actual = loadImportProjectFilesSync(f.context, configPath, f.files);
    assert.equal(actual.reason, undefined, JSON.stringify(actual));
    const root = mkdtempSync(join(tmpdir(), "realize-project-config-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const [path, text] of Object.entries(f.texts)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const oracle = ts.getParsedCommandLineOfConfigFile(
      join(root, configPath),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) =>
          assert.fail(String(diagnostic.messageText)),
      },
    );
    assert.equal(oracle.errors.length, 0);
    assert.deepEqual(
      actual.files,
      oracle.fileNames.map((path) => relative(root, path)).sort(),
    );
    for (const path of f.files)
      assert.equal(
        f.reads.has(path),
        false,
        "selectors do not read source content",
      );
  });

for (const [name, config] of [
  ["missing literal file", { files: ["../src/missing.util.ts"], include: [] }],
  ["external root", { files: ["../../external/file.ts"], include: [] }],
  ["absolute selector", { include: ["/src/**/*"] }],
  ["empty project", { include: ["../absent/**/*"] }],
  [
    "project reference",
    { include: ["../src/**/*"], references: [{ path: "../other" }] },
  ],
  ["invalid selector", { include: [false] }],
  [
    "unknown option",
    { include: ["../src/**/*"], compilerOptions: { unknownOption: true } },
  ],
])
  test(`root selection отказывает: ${name}`, () => {
    const f = fixture({
      [configPath]: JSON.stringify({ extends: "../tsconfig", ...config }),
    });
    assert.equal(
      loadImportProjectFilesSync(f.context, configPath, f.files).reason,
      "unsupported_configuration",
    );
  });

test("selectors используют прежний config depth limit и не обходят scan budget", () => {
  const f = fixture();
  const files = new Set(
    Array.from({ length: 10001 }, (_, index) => `src/${index}.ts`),
  );
  assert.equal(
    loadImportProjectFilesSync(f.context, configPath, files).reason,
    "scan_budget",
  );
  assert.equal(
    loadImportConfigurationSync(f.context, "src/main.util.ts", "../escape.json")
      .reason,
    "forbidden",
  );
});
