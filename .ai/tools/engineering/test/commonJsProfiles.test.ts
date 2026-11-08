/**
 * @file .ai/tools/engineering/test/commonJsProfiles.test.ts
 * @version 1.1.0
 * @date 2026-11-02
 * @description Проверяет CommonJS profiles, консервативный require guard и mode общего resolver.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderSourceTemplate } from "../src/renderSourceTemplate.util.ts";
import { resolveProjectArtifactKind } from "../src/resolveProjectArtifactKind.util.ts";
import { createSourceMoveResolver } from "../src/createSourceMoveResolver.service.ts";
import { rewriteSourceMove } from "../src/rewriteSourceMove.util.ts";
import { commonJsMoveData } from "./commonJsMove.fixture.ts";

const bytes = (path: string, body: string) =>
  renderSourceTemplate({
    path,
    body,
    createdOn: "2026-10-30",
    descriptionRu: "Проверяет CommonJS profile и ссылки.",
  });
function fixture(extension: "cjs" | "cts") {
  const d = commonJsMoveData(extension),
    files = new Map(
      [...d.files].map(([p, b]) => [p, Buffer.from(bytes(p, b)).toString()]),
    );
  const input = {
    files: new Set(files.keys()),
    from: d.from,
    to: d.to,
    referenceRoots: ["src"],
    readPaths: new Set<string>(),
    readReference(path: string) {
      const value = files.get(path);
      if (value === undefined)
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return Buffer.from(value);
    },
  };
  files.set(
    "tsconfig.json",
    '{"compilerOptions":{"module":"commonjs","moduleResolution":"node10"}}',
  );
  return { ...d, files, input, resolve: () => createSourceMoveResolver(input) };
}
for (const extension of ["cjs", "cts"] as const) {
  for (const [role, name, kind] of [
    ["util", "calculateTotal", "source.util"],
    ["service", "readPrice", "source.service"],
    ["adapter", "requestPrice", "source.adapter"],
    ["adapter", "Price", "source.adapter"],
  ] as const)
    test(`${extension} ${role} ${name}: registered profile и native grammar`, () => {
      const f = fixture(extension),
        path = `src/feature/${name}.${role}.${extension}`;
      assert.equal(resolveProjectArtifactKind(path), kind);
      assert.ok(f.files.get(path)!.includes("@file " + path));
    });
  test(`${extension} передаёт require/import mode, сохраняя literal target`, () => {
    const f = fixture(extension),
      calls: Array<{ specifier: string; mode: string | undefined }> = [];
    rewriteSourceMove({
      path: f.consumer,
      finalPath: f.consumer,
      source: f.files.get(f.consumer)!,
      from: f.from,
      to: f.to,
      files: f.input.files,
      changedOn: "2026-10-30",
      resolveReference(_p, _f, s, mode) {
        calls.push({ specifier: s, mode });
        return s;
      },
    });
    assert.deepEqual(
      calls.map((x) => x.mode),
      extension === "cjs"
        ? ["require", "require", "import"]
        : ["require", "require", "require"],
    );
  });
  test(`${extension} общий resolver подтверждает incoming/outgoing .cjs и alias`, () => {
    const f = fixture(extension);
    f.files.set(
      "tsconfig.json",
      '{"compilerOptions":{"module":"commonjs","moduleResolution":"node10","baseUrl":".","paths":{"@tool/*":["src/*"]}}}',
    );
    const r = f.resolve();
    assert.equal(
      r.resolveReference(f.from, f.to, "./readPrice.service.cjs", "require"),
      "../feature/readPrice.service.cjs",
    );
    assert.equal(
      r.resolveReference(
        f.consumer,
        f.consumer,
        "./feature/calculateTotal.util.cjs",
        "require",
      ),
      "./moved/calculateTotal.util.cjs",
    );
    assert.equal(
      r.resolveReference(
        f.consumer,
        f.consumer,
        "@tool/feature/calculateTotal.util.cjs",
        "require",
      ),
      "@tool/moved/calculateTotal.util.cjs",
    );
  });
  test(`${extension} .cts/.cjs companions сохраняют ambiguity`, () => {
    const f = fixture(extension),
      other = f.from.replace(
        /\.(?:cjs|cts)$/,
        extension === "cjs" ? ".cts" : ".cjs",
      );
    f.files.set(other, "function calculateTotal(){return 1;}");
    f.input.files.add(other);
    assert.throws(
      () =>
        f
          .resolve()
          .resolveReference(
            f.consumer,
            f.consumer,
            "./feature/calculateTotal.util.cjs",
            "require",
          ),
      /ambiguous/,
    );
  });
  for (const specifier of ["./readPrice.service", "./readPrice.service.js"])
    test(`${extension} не получает новый fallback ${specifier}`, () => {
      const f = fixture(extension);
      assert.throws(
        () => f.resolve().resolveReference(f.from, f.to, specifier, "require"),
        { code: "UNSUPPORTED" },
      );
    });
  for (const body of [
    'function calculateTotal(require) { return require("./readPrice.service.cjs"); }',
    'const require = () => 1; function calculateTotal(){ return require("./readPrice.service.cjs"); }',
    'function calculateTotal(){ const require = () => 1; return require("./readPrice.service.cjs"); }',
    'function calculateTotal(){ const load = require; return load("./readPrice.service.cjs"); }',
    'function calculateTotal(){ require = () => 1; return require("./readPrice.service.cjs"); }',
    'function calculateTotal(){ return module.require("./readPrice.service.cjs"); }',
    'function calculateTotal(){ return require.resolve("./readPrice.service.cjs"); }',
    'function calculateTotal(){ return require["resolve"]("./readPrice.service.cjs"); }',
    'function calculateTotal(){ return require?.("./readPrice.service.cjs"); }',
    'function calculateTotal(){ return require("./readPrice.service.cjs", {}); }',
    "function calculateTotal(){ return require(`./readPrice.service.cjs`); }",
    "function calculateTotal(){ return require(target); }",
    'function calculateTotal(){ return new require("./readPrice.service.cjs"); }',
    'function calculateTotal(){ return require.call(null,"./readPrice.service.cjs"); }',
    'function calculateTotal(){ return require(...["./readPrice.service.cjs"]); }',
    'with (loader) { require("./readPrice.service.cjs"); } function calculateTotal(){return 42;}',
    'function calculateTotal(){eval("var require = loader");return require("./readPrice.service.cjs");}',
  ])
    test(`${extension} требует direct unshadowed require: ${body.slice(0, 75)}`, () => {
      const f = fixture(extension);
      assert.throws(
        () =>
          rewriteSourceMove({
            path: f.from,
            finalPath: f.to,
            source: Buffer.from(bytes(f.from, body)).toString(),
            from: f.from,
            to: f.to,
            files: f.input.files,
            changedOn: "2026-10-30",
            resolveReference: f.resolve().resolveReference,
          }),
        { code: "UNSUPPORTED" },
      );
    });
  test(`${extension} node builtin сохраняется без обращения к module resolver`, () => {
    const f = fixture(extension);
    let calls = 0;
    const source = Buffer.from(
      bytes(f.from, 'function calculateTotal(){ return require("node:fs"); }'),
    ).toString();
    const rewritten = rewriteSourceMove({
      path: f.from,
      finalPath: f.to,
      source,
      from: f.from,
      to: f.to,
      files: f.input.files,
      changedOn: "2026-10-30",
      resolveReference() {
        calls++;
        throw Error("unexpected resolution");
      },
    });
    assert.equal(calls, 0);
    assert.ok(rewritten.includes('require("node:fs")'));
  });
  test(`${extension} packageExportsWrite требует workspace owner и полный scope`, () => {
    const f = fixture(extension);
    assert.throws(
      () =>
        createSourceMoveResolver({
          ...f.input,
          packageExportsWrite: {
            path: "packages/math/package.json",
            workspaceRoots: ["packages"],
            allConsumersInReferenceRoots: true,
          },
        }),
      { code: "UNSUPPORTED" },
    );
  });
}
for (const [extension, body] of [
  ["cjs", "export function calculateTotal(){return 42;}"],
  [
    "cjs",
    'import {readPrice} from "./readPrice.service.cjs"; function calculateTotal(){return readPrice();}',
  ],
  ["cjs", "function calculateTotal(value: number){return value;}"],
  ["cjs", "function calculateTotal(){return import.meta.url;}"],
  ["cts", "export function calculateTotal(){return import.meta.url;}"],
  ["cjs", "await Promise.resolve(); function calculateTotal(){return 42;}"],
  [
    "cts",
    "await Promise.resolve(); export function calculateTotal(){return 42;}",
  ],
  ["cts", "export declare function calculateTotal(): number;"],
])
  test(`CommonJS grammar ${extension}: ${body.slice(0, 65)}`, () =>
    assert.throws(() => bytes("src/calculateTotal.util." + extension, body), {
      code: "INVALID_INPUT",
    }));
test("CTS import-equals и type reference сохраняют require mode", () => {
  const f = fixture("cts");
  for (const path of [
    "src/feature/requestPrice.adapter.cts",
    "src/feature/readPrice.service.cts",
  ]) {
    const modes: Array<string | undefined> = [];
    rewriteSourceMove({
      path,
      finalPath: path,
      source: f.files.get(path)!,
      from: f.from,
      to: f.to,
      files: f.input.files,
      changedOn: "2026-10-30",
      resolveReference(_p, _f, s, mode) {
        modes.push(mode);
        return s;
      },
    });
    assert.ok(modes.length > 0);
    assert.ok(modes.every((mode) => mode === "require"));
  }
});
for (const path of [
  "src/calculateTotal.util.ts",
  "src/calculateTotal.util.mts",
  "src/calculateTotal.util.mjs",
])
  test(`CommonJS admission не расширяет require в ${path}`, () => {
    const source = Buffer.from(
      bytes(
        path,
        'export function calculateTotal(){return require("./readPrice.service.cjs");}',
      ),
    ).toString();
    assert.throws(
      () =>
        rewriteSourceMove({
          path,
          finalPath: path,
          source,
          from: path,
          to: path,
          files: new Set([path]),
          changedOn: "2026-10-30",
          resolveReference: (_p, _f, s) => s,
        }),
      { code: "UNSUPPORTED" },
    );
  });
for (const name of [
  "Value.types.cjs",
  "Value.types.cts",
  "Card.component.cjs",
  "Card.component.cts",
  "feature.config.cjs",
  "feature.config.cts",
  "calculateTotal.util.d.cts",
])
  test(`CommonJS registration не включает ${name}`, () =>
    assert.equal(resolveProjectArtifactKind("src/" + name), null));
