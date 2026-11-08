/**
 * @file .ai/tools/agent-search/test/moduleRelocation.test.mjs
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет общий sync/async resolution, обратные aliases, отрицательные probes и разделение read grants.
 * @see documentation/architecture/repository-search.md
 */
import assert from "node:assert/strict";
import { styleModuleTarget } from "../src/styleModuleTarget.util.mjs";
import { test } from "node:test";
import {
  createImportReadContext,
  createImportReadContextSync,
} from "../src/createImportReadContext.service.mjs";
import {
  resolveModulePath,
  resolveModulePathSync,
} from "../src/resolveModulePath.service.mjs";
import { loadImportConfigurationSync } from "../src/loadImportConfiguration.service.mjs";
import { findModuleAliasSpecifiers } from "../src/findModuleAliasSpecifiers.util.mjs";

function fixture(files, isAllowed = () => true) {
  const reads = new Map();
  const adapter = {
    isAllowed,
    read(path, { maximumBytes, onReadBytes }) {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      if (!Object.hasOwn(files, path)) return { status: "not_found" };
      const text = files[path],
        size = Buffer.byteLength(text);
      if (size > maximumBytes) return { status: "file_too_large" };
      onReadBytes(size);
      return { status: "ok", text };
    },
    listDirectories: () => ({ status: "ok", directories: [] }),
  };
  return { reads, adapter, context: createImportReadContextSync(adapter) };
}
const config = (paths = { "@app/*": ["src/*"] }, extra = {}) =>
  JSON.stringify({ compilerOptions: { baseUrl: ".", paths, ...extra } });
const source = "src/math/calculateTotal.util.ts",
  from = "src/useTotal.util.ts",
  specifier = "@app/math/calculateTotal.util";
const resolve = (context, value = specifier) =>
  resolveModulePathSync(context, from, value, "import", "relocation");

for (const [extension, styles] of Object.entries({
  ts: ["", ".ts", ".js"],
  tsx: ["", ".tsx", ".js", ".jsx"],
  js: ["", ".js"],
  jsx: ["", ".jsx", ".js"],
}))
  for (const style of styles)
    test(`shared relocation сохраняет .${extension} target и ${style || "extensionless"} specifier`, () => {
      const target = `src/new/ProductCard.component.${extension}`;
      const specifier = `@app/new/ProductCard.component${style}`;
      const f = fixture({ "tsconfig.json": config(), [target]: "export {};" });
      assert.equal(
        styleModuleTarget(target, specifier),
        `src/new/ProductCard.component${style}`,
      );
      assert.deepEqual(
        findModuleAliasSpecifiers(
          { baseUrl: ".", paths: { "@app/*": ["src/*"] } },
          target,
          specifier,
        ),
        [specifier],
      );
      assert.equal(resolve(f.context, specifier).path, target);
      if (style)
        assert.ok(
          ![...f.reads.keys()].some((path) =>
            path.startsWith(`src/new/ProductCard.component${style}/`),
          ),
        );
    });

test("inverse с фиксированным suffix не меняет extension style молча", () => {
  assert.deepEqual(
    findModuleAliasSpecifiers(
      { baseUrl: ".", paths: { "@app/*": ["src/*.tsx"] } },
      "src/ProductCard.component.tsx",
      "@app/Old.component.jsx",
    ),
    [],
  );
});

test("один алгоритм даёт одинаковый navigation результат для sync и async I/O", async () => {
  for (const files of [
    { "tsconfig.json": config(), [source]: "export {};" },
    {
      "tsconfig.json": '{"extends":"./base.json"}',
      "base.json": config(),
      [source]: "export {};",
    },
  ]) {
    const f = fixture(files);
    const asyncContext = createImportReadContext({
      ...f.adapter,
      read: async (...args) => f.adapter.read(...args),
    });
    assert.deepEqual(
      await resolveModulePath(asyncContext, from, specifier),
      resolveModulePathSync(f.context, from, specifier),
    );
  }
});

test("relocation сохраняет bytes cache, конфигурацию и отрицательные probes", () => {
  const f = fixture({ "tsconfig.json": config(), [source]: "export {};" });
  assert.equal(resolve(f.context).path, source);
  assert.equal(resolve(f.context).path, source);
  assert.equal(f.context.footprint.get("src/tsconfig.json"), "not_found");
  assert.equal(
    f.context.footprint.get("src/math/calculateTotal.util.js"),
    "not_found",
  );
  assert.ok([...f.reads.values()].every((count) => count === 1));
  assert.ok(f.context.stats.bytesRead > 0);
});

test("навигационный первый кандидат сохраняется, mutation требует единственную цель", async () => {
  for (const other of [
    "src/math/calculateTotal.util.js",
    "src/math/calculateTotal.util/index.ts",
  ]) {
    const f = fixture({
      "tsconfig.json": config(),
      [source]: "export {};",
      [other]: "export {};",
    });
    assert.equal(
      (await resolveModulePath(f.context, from, specifier)).path,
      source,
    );
    assert.equal(resolve(f.context).reason, "ambiguous");
  }
});

test("обратный wildcard mapping учитывает prefix/suffix и не выбирает произвольный alias", () => {
  assert.deepEqual(
    findModuleAliasSpecifiers(
      { baseUrl: ".", paths: { "@app/*": ["src/*"] } },
      "src/pricing/calculateTotal.util",
    ),
    ["@app/pricing/calculateTotal.util"],
  );
  assert.deepEqual(
    findModuleAliasSpecifiers(
      { baseUrl: ".", paths: { "@app/*": ["src/*.ts"] } },
      source,
    ),
    ["@app/math/calculateTotal.util"],
  );
  assert.deepEqual(
    findModuleAliasSpecifiers(
      { baseUrl: ".", paths: { "@app/*": ["src/*"], "@other/*": ["src/*"] } },
      source,
    ),
    ["@app/math/calculateTotal.util.ts", "@other/math/calculateTotal.util.ts"],
  );
});

test("relocation разрешает exact target с теми же уникальностью и ACL", () => {
  const f = fixture({
    "tsconfig.json": config({ [specifier]: [source] }),
    [source]: "export {};",
  });
  assert.equal(resolve(f.context).path, source);
  assert.deepEqual(
    findModuleAliasSpecifiers(
      { baseUrl: ".", paths: { "@total": [source] } },
      source,
      "@old",
    ),
    ["@total"],
  );
  const ambiguous = fixture({
    "tsconfig.json": config({ [specifier]: [source] }),
    [source]: "export {};",
    [source.replace(/\.ts$/, ".js")]: "export {};",
  });
  assert.equal(resolve(ambiguous.context).reason, "ambiguous");
});

for (const [name, text, additional] of [
  ["exact fallback targets", config({ [specifier]: [source, "other.ts"] }), {}],
  ["exact с wildcard target", config({ [specifier]: ["src/*"] }), {}],
  ["fallback targets", config({ "@app/*": ["src/*", "other/*"] }), {}],
  ["без baseUrl", '{"compilerOptions":{"paths":{"@app/*":["src/*"]}}}', {}],
  [
    "multiple bases",
    '{"extends":["./base.json","./other.json"]}',
    { "base.json": config(), "other.json": "{}" },
  ],
  ["cycle", '{"extends":"./tsconfig.json"}', {}],
  ["moduleSuffixes", config(undefined, { moduleSuffixes: [".web", ""] }), {}],
  [
    "неподдержанный resolution",
    config(undefined, { moduleResolution: "nodenext" }),
    {},
  ],
])
  test(`relocation отклоняет ${name} без ослабления caller policy`, () => {
    const f = fixture({
      "tsconfig.json": text,
      [source]: "export {};",
      ...additional,
    });
    assert.equal(resolve(f.context).reason, "unsupported_configuration");
  });

test("config grant не превращается в source grant через общий cache", () => {
  const f = fixture(
    { "tsconfig.json": config() },
    (_, purpose) => purpose === "config",
  );
  assert.equal(f.context.read("tsconfig.json", "config").status, "ok");
  assert.equal(f.context.read("tsconfig.json", "source").status, "forbidden");
  assert.equal(f.reads.get("tsconfig.json"), 1);
});

test("отказ config read не допускает fallback к произвольному resolver", () => {
  const f = fixture(
    { "tsconfig.json": config(), [source]: "export {};" },
    (path) => path !== "tsconfig.json",
  );
  assert.equal(resolve(f.context).reason, "forbidden");
  assert.equal(f.reads.has(source), false);
});

test("ближайшая config определяется по новому местоположению consumer", () => {
  const f = fixture({
    "tsconfig.json": config(),
    "src/pricing/tsconfig.json": config({ "@app/*": ["alternate/*"] }),
  });
  assert.equal(
    loadImportConfigurationSync(f.context, from).configuration.path,
    "tsconfig.json",
  );
  assert.equal(
    loadImportConfigurationSync(f.context, "src/pricing/useTotal.util.ts")
      .configuration.path,
    "src/pricing/tsconfig.json",
  );
});

test("sync reader сохраняет предел probes и требует синхронный I/O", () => {
  const f = fixture({});
  for (let i = 0; i < 1024; i++)
    assert.equal(f.context.read(`src/missing${i}.ts`).status, "not_found");
  assert.equal(f.context.read("src/overflow.ts").status, "scan_budget");
  assert.equal(f.reads.size, 1024);
  const invalid = createImportReadContextSync({
    ...f.adapter,
    read: async () => ({ status: "not_found" }),
  });
  assert.throws(
    () => invalid.read("src/value.ts"),
    /Synchronous import reader/,
  );
});
