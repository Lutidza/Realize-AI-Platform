/**
 * @file .ai/tools/engineering/test/mjsProfiles.test.ts
 * @version 1.2.0
 * @date 2026-10-30
 * @description Проверяет MJS profiles, grammar и reuse общего module resolver без изменения форматов соседних profiles.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createProjectArtifactBinding,
  renderSourceTemplate,
} from "../src/projectEngineering.index.ts";
import { resolveProjectArtifactKind } from "../src/resolveProjectArtifactKind.util.ts";
import { validateSourceArtifact } from "../src/validateSourceArtifact.validator.ts";
import { createSourceMoveResolver } from "../src/createSourceMoveResolver.service.ts";
import { rewriteSourceMove } from "../src/rewriteSourceMove.util.ts";
import { esmKinds, esmMoveData } from "./esmMove.fixture.ts";

const bytes = (path: string, body: string) =>
  renderSourceTemplate({
    path,
    body,
    createdOn: "2026-10-30",
    descriptionRu: "Проверяет MJS profile.",
  });
const binding = (allowedKinds = esmKinds) =>
  createProjectArtifactBinding({
    readReference: (path) => readFileSync(path),
    folderPolicies: [
      {
        id: "mjs",
        version: "1",
        root: "src",
        ownerRef: "fixture",
        purpose: "MJS profiles",
        boundary: "owner",
        allowedKinds,
        allowedProvenance: ["authored"],
        sourcePaths: [
          ".ai/tools/engineering/src/projectArtifactProfiles.config.ts",
        ],
      },
    ],
  });
for (const [name, body, kind] of [
  [
    "calculateTotal.util.mjs",
    "export function calculateTotal() { return 42; }",
    "source.util",
  ],
  [
    "readPrice.service.mjs",
    "export const readPrice = async () => 41;",
    "source.service",
  ],
  [
    "requestPrice.adapter.mjs",
    "export function requestPrice() { return 41; }",
    "source.adapter",
  ],
  [
    "Price.adapter.mjs",
    "export class PriceAdapter { read() { return 41; } }",
    "source.adapter",
  ],
] as const)
  test(`MJS ${name}: create/edit descriptor, existing kind и allowedKinds согласованы`, () => {
    const path = "src/feature/" + name,
      content = bytes(path, body),
      b = binding();
    assert.equal(resolveProjectArtifactKind(path), kind);
    const descriptor = b.resolveFile({ path, content, artifactKind: kind });
    assert.equal(descriptor.kindId, kind);
    assert.deepEqual(b.resolveExistingFile!({ path, content }), descriptor);
    assert.ok(descriptor.validatedChecks.includes("source.syntax"));
    assert.throws(
      () =>
        binding(esmKinds.filter((k) => k !== kind)).resolveExistingFile!({
          path,
          content,
        }),
      { code: "UNSUPPORTED" },
    );
    assert.throws(
      () => b.resolveFile({ path, content, artifactKind: "source.component" }),
      { code: "UNSUPPORTED" },
    );
  });
test("MJS registration не разрешает неподдержанный NodeNext config", () => {
  const f = resolutionFixture();
  f.files.set(
    "tsconfig.json",
    '{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","allowJs":true}}',
  );
  assert.throws(
    () => f.resolve().resolveReference(f.from, f.to, "./readPrice.service.mjs"),
    /unsupported_configuration/,
  );
});
for (const body of [
  "export function calculateTotal(value: number) { return value; }",
  "interface Value {} export function calculateTotal() { return 42; }",
  "export function calculateTotal() { return 42 as number; }",
  "export function wrongName() { return 42; }",
  "export function calculateTotal( {",
])
  test(`MJS отклоняет неверную grammar/naming: ${body.slice(0, 45)}`, () =>
    assert.throws(() => bytes("src/calculateTotal.util.mjs", body)));
for (const name of [
  "calculateTotal.util.js",
  "calculateTotal.util.d.mts",
  "CalculateTotal.component.cts",
  "CalculateTotal.types.cjs",
  "ReadPrice.types.mts",
  "Price.component.cjs",
  "Card.component.mjs",
  "Value.types.mjs",
  "feature.config.mjs",
])
  test(`MJS registration не расширяет соседний format/kind ${name}`, () =>
    assert.equal(resolveProjectArtifactKind("src/" + name), null));
test("MJS directives не обходят execution boundary", () => {
  const path = "src/readPrice.service.mjs",
    source = Buffer.from(
      bytes(path, '"use server"; export function readPrice(){return 41;}'),
    ).toString();
  assert.doesNotThrow(() => validateSourceArtifact(path, source, "server"));
  assert.throws(() => validateSourceArtifact(path, source, "client"), {
    code: "UNSUPPORTED",
  });
});

function resolutionFixture() {
  const d = esmMoveData(),
    files = new Map(
      [...d.files].map(([path, body]) => [
        path,
        Buffer.from(bytes(path, body)).toString(),
      ]),
    );
  const input = {
    files: new Set(files.keys()),
    from: d.from,
    to: d.to,
    referenceRoots: ["src"],
    readPaths: new Set<string>(),
    readReference(path: string) {
      const text = files.get(path);
      if (text === undefined)
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return Buffer.from(text);
    },
  };
  files.set(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        moduleResolution: "bundler",
        module: "esnext",
        allowJs: true,
      },
    }),
  );
  return { ...d, files, input, resolve: () => createSourceMoveResolver(input) };
}
test("общий resolver сохраняет явное .mjs для incoming/outgoing и literal dynamic import", () => {
  const f = resolutionFixture(),
    r = f.resolve();
  assert.equal(
    r.resolveReference(f.from, f.to, "./readPrice.service.mjs"),
    "../feature/readPrice.service.mjs",
  );
  assert.equal(
    r.resolveReference(
      f.consumer,
      f.consumer,
      "./feature/calculateTotal.util.mjs",
    ),
    "./moved/calculateTotal.util.mjs",
  );
  const source = rewriteSourceMove({
    path: f.consumer,
    finalPath: f.consumer,
    source: f.files.get(f.consumer)!,
    from: f.from,
    to: f.to,
    files: f.input.files,
    changedOn: "2026-10-30",
    resolveReference: r.resolveReference,
  });
  assert.equal(source.split('"./moved/calculateTotal.util.mjs"').length - 1, 2);
  assert.ok(
    source.includes(
      'export { readPrice } from "./feature/readPrice.service.mjs"',
    ),
  );
});
for (const specifier of [
  "./calculateTotal.util",
  "./calculateTotal.util.js",
  "./missing.util.mjs",
])
  test(`MJS reference не получает новый fallback: ${specifier}`, () => {
    const f = resolutionFixture();
    assert.throws(() => f.resolve().resolveReference(f.from, f.to, specifier), {
      code: "UNSUPPORTED",
    });
  });
test(".mts companion не скрывает неоднозначность .mjs цели", () => {
  const f = resolutionFixture(),
    path = f.from.replace(/\.mjs$/, ".mts");
  f.files.set(path, "export function calculateTotal() { return 0; }");
  f.input.files.add(path);
  assert.throws(
    () =>
      f
        .resolve()
        .resolveReference(
          f.consumer,
          f.consumer,
          "./feature/calculateTotal.util.mjs",
        ),
    /ambiguous/,
  );
});
test("MJS wildcard paths alias сохраняет extension через прежний resolver", () => {
  const f = resolutionFixture();
  f.files.set(
    "tsconfig.json",
    '{"compilerOptions":{"moduleResolution":"bundler","baseUrl":".","paths":{"@tool/*":["src/*"]},"allowJs":true}}',
  );
  assert.equal(
    f
      .resolve()
      .resolveReference(
        f.consumer,
        f.consumer,
        "@tool/feature/calculateTotal.util.mjs",
      ),
    "@tool/moved/calculateTotal.util.mjs",
  );
});
for (const body of [
  'export function calculateTotal() { return require("./readPrice.service.mjs"); }',
  'export function calculateTotal() { const target = "./readPrice.service.mjs"; return import(target); }',
  "export function calculateTotal() { return import(`./readPrice.service.mjs`); }",
])
  test(`MJS move не разрешает неподдержанный reference: ${body.slice(0, 65)}`, () => {
    const f = resolutionFixture();
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
