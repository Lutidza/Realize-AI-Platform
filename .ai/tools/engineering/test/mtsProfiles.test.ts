/**
 * @file .ai/tools/engineering/test/mtsProfiles.test.ts
 * @version 1.1.0
 * @date 2026-10-30
 * @description Проверяет MTS grammar, границы profiles и сохранение runtime extensions общим resolver.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderSourceTemplate } from "../src/renderSourceTemplate.util.ts";
import { resolveProjectArtifactKind } from "../src/resolveProjectArtifactKind.util.ts";
import { validateSourceArtifact } from "../src/validateSourceArtifact.validator.ts";
import { createSourceMoveResolver } from "../src/createSourceMoveResolver.service.ts";
import { rewriteSourceMove } from "../src/rewriteSourceMove.util.ts";
import { esmMoveData } from "./esmMove.fixture.ts";

const bytes = (path: string, body: string) =>
  renderSourceTemplate({
    path,
    body,
    createdOn: "2026-10-30",
    descriptionRu: "Проверяет TypeScript ESM profile.",
  });
for (const [name, body, kind] of [
  [
    "calculateTotal.util.mts",
    "export function calculateTotal(value: number): number { return value; }",
    "source.util",
  ],
  [
    "readPrice.service.mts",
    "export const readPrice = async (): Promise<number> => 41;",
    "source.service",
  ],
  [
    "requestPrice.adapter.mts",
    "export function requestPrice(): number { return 41; }",
    "source.adapter",
  ],
  [
    "Price.adapter.mts",
    "export class PriceAdapter { read(): number { return 41; } }",
    "source.adapter",
  ],
] as const)
  test(`MTS ${name} сохраняет typed implementation`, () => {
    const path = "src/feature/" + name,
      source = Buffer.from(bytes(path, body)).toString();
    assert.equal(resolveProjectArtifactKind(path), kind);
    assert.deepEqual(validateSourceArtifact(path, source), []);
    assert.ok(source.includes(body));
  });
for (const [name, body] of [
  [
    "calculateTotal.util.mts",
    "export function wrongName(): number { return 1; }",
  ],
  [
    "calculateTotal.util.mts",
    "export declare function calculateTotal(): number;",
  ],
  [
    "Price.adapter.mts",
    "export declare class PriceAdapter { read(): number; }",
  ],
  [
    "readPrice.service.mts",
    "interface Price {} export function readPrice(): number { return 1; }",
  ],
  [
    "calculateTotal.util.mts",
    "export function calculateTotal(value:): number { return value; }",
  ],
])
  test(`MTS отклоняет неверную реализацию ${name}: ${body.slice(0, 45)}`, () =>
    assert.throws(() => bytes("src/" + name, body), { code: "INVALID_INPUT" }));
for (const name of [
  "CalculateTotal.types.cts",
  "CalculateTotal.component.cjs",
  "calculateTotal.util.d.mts",
  "Price.types.mts",
  "Card.component.mts",
  "price.config.mts",
])
  test(`MTS registration не подключает ${name}`, () =>
    assert.equal(resolveProjectArtifactKind("src/" + name), null));
test("MTS registration сохраняет physical execution boundary", () => {
  const path = "src/readPrice.service.mts",
    source = Buffer.from(
      bytes(
        path,
        '"use client"; export function readPrice(): number { return 41; }',
      ),
    ).toString();
  assert.throws(() => validateSourceArtifact(path, source, "server"), {
    code: "UNSUPPORTED",
  });
});
function resolutionFixture() {
  const d = esmMoveData("src", "mts"),
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
    '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler"}}',
  );
  return { ...d, files, input, resolve: () => createSourceMoveResolver(input) };
}
for (const extension of ["mjs", "mts"])
  test(`MTS target сохраняет явный ${extension} specifier`, () => {
    const f = resolutionFixture(),
      r = f.resolve();
    assert.equal(
      r.resolveReference(f.from, f.to, "./readPrice.service." + extension),
      "../feature/readPrice.service." + extension,
    );
    assert.equal(
      r.resolveReference(
        f.consumer,
        f.consumer,
        "./feature/calculateTotal.util." + extension,
      ),
      "./moved/calculateTotal.util." + extension,
    );
  });
test("MTS type reference и runtime import используют один rewrite", () => {
  const f = resolutionFixture(),
    source = f.files
      .get(f.consumer)!
      .replace(
        "useTotal(): number",
        'useTotal(): ReturnType<typeof import("./feature/calculateTotal.util.mjs")["calculateTotal"]>',
      );
  const rewritten = rewriteSourceMove({
    path: f.consumer,
    finalPath: f.consumer,
    source,
    from: f.from,
    to: f.to,
    files: f.input.files,
    changedOn: "2026-10-30",
    resolveReference: f.resolve().resolveReference,
  });
  assert.equal(
    rewritten.split('"./moved/calculateTotal.util.mjs"').length - 1,
    3,
  );
});
for (const suffix of ["mjs", "d.mts"])
  test(`MTS ${suffix} companion остаётся неоднозначностью`, () => {
    const f = resolutionFixture(),
      path = f.from.replace(/\.mts$/, "." + suffix);
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
for (const specifier of ["./readPrice.service", "./readPrice.service.js"])
  test(`MTS не получает fallback ${specifier}`, () => {
    const f = resolutionFixture();
    assert.throws(() => f.resolve().resolveReference(f.from, f.to, specifier), {
      code: "UNSUPPORTED",
    });
  });
for (const mode of ["nodenext", "node16"])
  test(`MTS registration не расширяет moduleResolution ${mode}`, () => {
    const f = resolutionFixture();
    f.files.set(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { module: mode, moduleResolution: mode },
      }),
    );
    assert.throws(
      () =>
        f.resolve().resolveReference(f.from, f.to, "./readPrice.service.mjs"),
      /unsupported_configuration/,
    );
  });
