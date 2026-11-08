/**
 * @file .ai/tools/engineering/test/sourceProfiles.test.ts
 * @version 1.2.0
 * @date 2026-10-30
 * @description Проверяет named source profiles, JS grammar, type-only contracts и независимые owner/boundary guards.
 * @see documentation/architecture/engineering-artifacts.md
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createProjectArtifactBinding,
  renderSourceTemplate,
} from "../src/projectEngineering.index.ts";
import { validateSourceArtifact } from "../src/validateSourceArtifact.validator.ts";
import { resolveProjectArtifactKind } from "../src/resolveProjectArtifactKind.util.ts";
import { resolveProjectFolderPolicy } from "../src/resolveProjectFolderPolicy.validator.ts";
import type { ProjectFolderPolicy } from "../src/ProjectArtifactBinding.types.ts";
import { profileKinds } from "./profileMove.fixture.ts";

const sourcePath =
  ".ai/tools/engineering/src/projectArtifactProfiles.config.ts";
const policy: ProjectFolderPolicy = {
  id: "fixture",
  version: "1",
  root: "src",
  ownerRef: "fixture",
  purpose: "Source profiles",
  boundary: "owner",
  allowedKinds: profileKinds,
  allowedProvenance: ["authored"],
  sourcePaths: [sourcePath],
};
const binding = (folderPolicies = [policy]) =>
  createProjectArtifactBinding({
    folderPolicies,
    readReference: (path) => readFileSync(path),
  });
const bytes = (path: string, body: string) =>
  renderSourceTemplate({
    path,
    body,
    createdOn: "2026-10-29",
    descriptionRu: "Проверяет формат исходника.",
  });

for (const [name, body, kind] of [
  [
    "resolvePrice.service.ts",
    "export async function resolvePrice() { return 42; }",
    "source.service",
  ],
  [
    "resolvePrice.service.js",
    "export const resolvePrice = () => 42;",
    "source.service",
  ],
  [
    "requestPrice.adapter.ts",
    "export function requestPrice() { return 42; }",
    "source.adapter",
  ],
  [
    "Price.adapter.js",
    "export class PriceAdapter { read() { return 42; } }",
    "source.adapter",
  ],
  [
    "ProductCard.component.tsx",
    '"use client"; export function ProductCard() { return <span>Price</span>; }',
    "source.component",
  ],
  [
    "ProductCard.component.jsx",
    "export const ProductCard = () => <span>Price</span>;",
    "source.component",
  ],
  [
    "ProductCard.types.ts",
    'import type { Price } from "./Price.types"; export interface ProductCardProps { price: Price }',
    "source.types",
  ],
])
  test(`profile ${name} определяется owner и проходит native guards`, () => {
    const path = `src/feature/${name}`,
      content = bytes(path, body),
      b = binding();
    const inferred = b.resolveExistingFile!({ path, content });
    assert.equal(inferred.kindId, kind);
    assert.deepEqual(
      b.resolveFile({ path, content, artifactKind: kind }),
      inferred,
    );
    assert.ok(inferred.readPaths.includes(sourcePath));
    assert.ok(inferred.validatedChecks.includes("source.boundary"));
    assert.equal(resolveProjectArtifactKind(path), kind);
    assert.throws(
      () => b.resolveFile({ path, content, artifactKind: "source.util" }),
      { code: "UNSUPPORTED" },
    );
    assert.throws(
      () =>
        binding([{ ...policy, allowedKinds: ["source.util"] }])
          .resolveExistingFile!({ path, content }),
      { code: "UNSUPPORTED" },
    );
  });

for (const [name, body] of [
  [
    "resolvePrice.service.js",
    "export function resolvePrice(value: number) { return value; }",
  ],
  [
    "ProductCard.component.jsx",
    "export function ProductCard(props: {}) { return <span/>; }",
  ],
  [
    "ProductCard.component.tsx",
    "interface Props {} export function ProductCard() { return <span/>; }",
  ],
  ["Price.adapter.ts", "export class Price {}"],
  ["PriceAdapter.adapter.ts", "export class PriceAdapter {}"],
  [
    "productCard.component.tsx",
    "export function productCard() { return <span/>; }",
  ],
  ["resolvePrice.service.ts", "export function wrongName() { return 42; }"],
  ["ProductCard.types.ts", "export const price = 42;"],
  ["ProductCard.types.ts", "export enum Price { Normal }"],
  [
    "ProductCard.types.ts",
    'import "./effect.service"; export interface Props {}',
  ],
  ["ProductCard.types.ts", 'export { price } from "./price.service";'],
  [
    "ProductCard.component.tsx",
    '"use client"; "use server"; export function ProductCard(){return <span/>;}',
  ],
  [
    "ProductCard.component.tsx",
    'import type { Props } from "./Props.types"; "use client"; export function ProductCard(){return <span/>;}',
  ],
])
  test(`profile отвергает некорректный ${name}: ${body.slice(0, 35)}`, () =>
    assert.throws(() => bytes(`src/feature/${name}`, body)));

for (const name of [
  "page.tsx",
  "layout.tsx",
  "index.ts",
  "feature.index.ts",
  "feature.config.cts",
  "ProductCard.component.ts",
  "feature.config.ts",
])
  test(`суффикс не включает дополнительный/native profile: ${name}`, () =>
    assert.equal(resolveProjectArtifactKind(`src/${name}`), null));

test("directives ограничены физической policy; types не содержат directives/runtime", () => {
  const path = "src/ProductCard.component.tsx",
    source = Buffer.from(
      bytes(
        path,
        '"use client"; export function ProductCard(){return <span/>;}',
      ),
    ).toString();
  assert.doesNotThrow(() => validateSourceArtifact(path, source, "client"));
  assert.throws(() => validateSourceArtifact(path, source, "server"), {
    code: "UNSUPPORTED",
  });
  assert.throws(() =>
    bytes(
      "src/ProductCard.types.ts",
      '"use client"; export interface Props {}',
    ),
  );
  assert.throws(
    () =>
      bytes(
        "services/payment/src/ProductCard.component.tsx",
        "export function ProductCard(){return <span/>;}",
      ),
    { code: "UNSUPPORTED" },
  );
  assert.throws(
    () =>
      resolveProjectFolderPolicy(
        [
          { ...policy, boundary: "client" },
          { ...policy, id: "child", root: "src/nested", boundary: "server" },
        ],
        "src/nested/x",
      ),
    { code: "UNSUPPORTED" },
  );
});
