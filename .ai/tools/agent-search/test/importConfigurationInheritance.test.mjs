/**
 * @file .ai/tools/agent-search/test/importConfigurationInheritance.test.mjs
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет наследование tsconfig, происхождение options и одинаковые bounds холодного и прогретого cache.
 * @see documentation/architecture/repository-search.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { posix } from "node:path";
import ts from "typescript";
import { createImportReadContextSync } from "../src/createImportReadContext.service.mjs";
import { loadImportConfigurationSync } from "../src/loadImportConfiguration.service.mjs";
import {
  resolveModulePath,
  resolveModulePathSync,
} from "../src/resolveModulePath.service.mjs";

const from = "src/main.util.ts",
  target = "src/value.util.ts",
  specifier = "@app/value.util";
const base = JSON.stringify({
  compilerOptions: {
    moduleResolution: "bundler",
    baseUrl: "..",
    paths: { "@app/*": ["src/*"] },
  },
});

function fixture(files, denied = []) {
  const reads = new Map();
  const context = createImportReadContextSync({
    isAllowed: (path) => !denied.includes(path),
    read(path, options) {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      if (!Object.hasOwn(files, path)) return { status: "not_found" };
      const text = files[path];
      if (Buffer.byteLength(text) > options.maximumBytes)
        return { status: "file_too_large" };
      options.onReadBytes(Buffer.byteLength(text));
      return { status: "ok", text };
    },
    listDirectories: () => ({ status: "forbidden" }),
  });
  return { context, reads };
}
const relocation = (context) =>
  resolveModulePathSync(context, from, specifier, "import", "relocation");

test("relative extends сохраняет origin, JSONC/BOM и один read каждой версии", async () => {
  const files = {
    "tsconfig.json": '\uFEFF{/* child */ "extends":["./config/middle"],}',
    "config/middle.json": '{"extends":"./base.json"}',
    "config/base.json": base,
    [target]: "export function value() {}",
  };
  const f = fixture(files);
  assert.equal(relocation(f.context).path, target);
  assert.equal(
    (await resolveModulePath(f.context, from, specifier)).path,
    target,
  );
  assert.equal(compilerTarget(files), target);
  const config = loadImportConfigurationSync(f.context, from);
  assert.equal(config.configuration.depth, 3);
  assert.equal(config.configuration.hasMultipleBases, false);
  assert.equal(config.settings.pathsSourcePath, "config/base.json");
  assert.equal(config.settings.baseUrlSourcePath, "config/base.json");
  const warm = loadImportConfigurationSync(f.context, "src/other.util.ts");
  assert.equal(warm.settings.pathsSourcePath, "config/base.json");
  assert.equal(warm.settings.baseUrlSourcePath, "config/base.json");
  for (const path of [
    "tsconfig.json",
    "config/middle.json",
    "config/base.json",
    target,
  ])
    assert.equal(f.reads.get(path), 1);
  assert.equal(f.context.footprint.get("src/tsconfig.json"), "not_found");
});

for (const [name, own, resolved] of [
  [
    "baseUrl и paths",
    { baseUrl: "override", paths: { "@app/*": ["alt/*"] } },
    "override/alt/value.util.ts",
  ],
  ["только baseUrl", { baseUrl: "override" }, "override/src/value.util.ts"],
  ["только paths", { paths: { "@app/*": ["alt/*"] } }, "alt/value.util.ts"],
])
  test(`child overrides ${name} совпадают с установленным TypeScript`, () => {
    const files = {
      "tsconfig.json": JSON.stringify({
        extends: "./config/base",
        compilerOptions: own,
      }),
      "config/base.json": base,
      [resolved]: "export function value() {}",
      [target]: "export function value() {}",
    };
    const f = fixture(files);
    assert.equal(relocation(f.context).path, resolved);
    assert.equal(compilerTarget(files), resolved);
    const config = loadImportConfigurationSync(f.context, from);
    assert.equal(
      config.settings.pathsSourcePath,
      own.paths ? "tsconfig.json" : "config/base.json",
    );
    assert.equal(
      config.settings.baseUrlSourcePath,
      own.baseUrl ? "tsconfig.json" : "config/base.json",
    );
  });

test("warm cache не обходит общий предел восьми config в цепочке", () => {
  const files = { "tsconfig.json": '{"extends":"./config/tsconfig"}' };
  for (let index = 0; index < 8; index++)
    files[index === 0 ? "config/tsconfig.json" : `config/${index}.json`] =
      index === 7 ? base : JSON.stringify({ extends: `./${index + 1}` });
  const cold = fixture(files),
    warm = fixture(files);
  assert.equal(
    loadImportConfigurationSync(cold.context, from).reason,
    "unsupported_configuration",
  );
  assert.ok(
    loadImportConfigurationSync(warm.context, "config/consumer.util.ts")
      .settings,
  );
  assert.equal(
    loadImportConfigurationSync(warm.context, from).reason,
    "unsupported_configuration",
  );
});

test("ровно восемь config допускаются и остаются восемью после cache hit", () => {
  const files = { [target]: "export function value() {}" };
  for (let index = 0; index < 8; index++)
    files[index === 0 ? "tsconfig.json" : `config/${index}.json`] =
      index === 7
        ? base
        : JSON.stringify({
            extends: index === 0 ? "./config/1" : `./${index + 1}`,
          });
  const f = fixture(files);
  assert.equal(relocation(f.context).path, target);
  assert.equal(relocation(f.context).path, target);
  assert.equal(
    loadImportConfigurationSync(f.context, from).configuration.depth,
    8,
  );
  assert.ok([...f.reads.values()].every((count) => count === 1));
});

test("несколько bases в ancestor сохраняют navigation и запрещают relocation даже после cache hit", async () => {
  const files = {
    "tsconfig.json": '{"extends":"./config/tsconfig"}',
    "config/tsconfig.json": '{"extends":["./base","./override"]}',
    "config/base.json": base,
    "config/override.json": "{}",
    [target]: "export function value() {}",
  };
  const f = fixture(files);
  assert.ok(
    loadImportConfigurationSync(f.context, "config/consumer.util.ts").settings,
  );
  assert.equal(
    (await resolveModulePath(f.context, from, specifier)).path,
    target,
  );
  assert.equal(
    loadImportConfigurationSync(f.context, from).configuration.hasMultipleBases,
    true,
  );
  assert.equal(relocation(f.context).reason, "unsupported_configuration");
});

for (const [name, declarations, denied, expected] of [
  [
    "missing base",
    { "tsconfig.json": '{"extends":"./config/missing"}' },
    [],
    "unsupported_configuration",
  ],
  [
    "cycle",
    {
      "tsconfig.json": '{"extends":"./config/base"}',
      "config/base.json": '{"extends":"../tsconfig"}',
    },
    [],
    "unsupported_configuration",
  ],
  [
    "package extends",
    { "tsconfig.json": '{"extends":"@tsconfig/node24"}' },
    [],
    "unsupported_configuration",
  ],
  [
    "absolute extends",
    { "tsconfig.json": '{"extends":"/config/base.json"}' },
    [],
    "unsupported_configuration",
  ],
  [
    "outside workspace",
    { "tsconfig.json": '{"extends":"../base.json"}' },
    [],
    "forbidden",
  ],
  [
    "denied base",
    {
      "tsconfig.json": '{"extends":"./config/base"}',
      "config/base.json": base,
    },
    ["config/base.json"],
    "forbidden",
  ],
  [
    "oversized base",
    {
      "tsconfig.json": '{"extends":"./config/base"}',
      "config/base.json": " ".repeat(512 * 1024 + 1),
    },
    [],
    "file_too_large",
  ],
])
  test(`наследование не скрывает ${name}`, () => {
    const f = fixture({ ...declarations, [target]: "export {};" }, denied);
    assert.equal(relocation(f.context).reason, expected);
    assert.equal(f.reads.has(target), false);
  });

function compilerTarget(files) {
  const root = "/fixture";
  const key = (path) => posix.relative(root, path);
  const host = {
    useCaseSensitiveFileNames: true,
    getCurrentDirectory: () => root,
    fileExists: (path) => Object.hasOwn(files, key(path)),
    readFile: (path) => files[key(path)],
    readDirectory: () =>
      Object.keys(files)
        .filter((path) => path.endsWith(".ts"))
        .map((path) => posix.join(root, path)),
    onUnRecoverableConfigFileDiagnostic: (diagnostic) =>
      assert.fail(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(
    root + "/tsconfig.json",
    { ignoreDeprecations: "6.0" },
    host,
  );
  assert.ok(parsed);
  assert.deepEqual(parsed.errors, []);
  const resolved = ts.resolveModuleName(
    specifier,
    posix.join(root, from),
    parsed.options,
    host,
  ).resolvedModule;
  assert.ok(resolved);
  return key(resolved.resolvedFileName);
}
