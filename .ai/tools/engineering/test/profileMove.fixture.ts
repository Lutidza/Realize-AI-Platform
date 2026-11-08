/**
 * @file .ai/tools/engineering/test/profileMove.fixture.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Собирает mixed source profiles на существующем native filesystem fixture.
 * @see documentation/architecture/engineering-operations.md
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import type { ProjectFolderPolicy } from "../src/ProjectArtifactBinding.types.ts";
import { renderSourceTemplate } from "../src/renderSourceTemplate.util.ts";
import {
  filesystemFixture,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

export const profileKinds = [
  "source.util",
  "source.service",
  "source.adapter",
  "source.component",
  "source.types",
];

export function profileMoveFixture(
  native: LoadEngineeringNativeInput,
  root?: string,
  extraFolderPolicies: readonly ProjectFolderPolicy[] = [],
) {
  const movePolicy = {
    changedOn: "2026-10-29",
    coverage: "complete" as const,
    referenceRoots: ["src"],
    sourcePaths: [policySource],
  };
  const f = filesystemFixture(
    native,
    root,
    undefined,
    [],
    movePolicy,
    extraFolderPolicies,
    profileKinds,
  );
  const put = (path: string, bytes: string | Uint8Array) => {
    mkdirSync(dirname(join(f.checkout, path)), { recursive: true });
    writeFileSync(join(f.checkout, path), bytes);
  };
  const source = (path: string, body: string) =>
    put(
      path,
      renderSourceTemplate({
        path,
        body,
        createdOn: "2026-10-29",
        descriptionRu: "Проверяет перенос авторского исходника.",
      }),
    );
  if (!root) {
    mkdirSync(join(f.checkout, "src/moved"));
    put(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          moduleResolution: "bundler",
          baseUrl: ".",
          paths: { "@app/*": ["src/*"] },
        },
      }),
    );
    source(
      "src/feature/Price.adapter.ts",
      "export class PriceAdapter { read() { return 42; } }",
    );
    source(
      "src/feature/resolvePrice.service.ts",
      'import { PriceAdapter } from "./Price.adapter.js";\nexport function resolvePrice() { return new PriceAdapter().read(); }',
    );
    source(
      "src/usePrice.service.ts",
      'export { PriceAdapter } from "./feature/Price.adapter";\nimport { resolvePrice } from "@app/feature/resolvePrice.service";\nexport function usePrice() { return resolvePrice(); }',
    );
    source(
      "src/feature/ProductCard.types.ts",
      "export interface ProductCardProps { label: string }",
    );
    source(
      "src/feature/ProductCard.component.tsx",
      '"use client";\nimport type { ProductCardProps } from "./ProductCard.types";\nexport function ProductCard(props: ProductCardProps) { return <span>{props.label}</span>; }',
    );
    source(
      "src/PreviewCard.component.tsx",
      '"use client";\nimport { ProductCard } from "@app/feature/ProductCard.component";\nexport function PreviewCard() { return <ProductCard label="Price" />; }',
    );
  }
  const command = (from: string, to = `src/moved/${from.split("/").at(-1)}`) =>
    planCommand([
      {
        kind: "move",
        from,
        to,
        expectedVersion: sha256Bytes(readFileSync(join(f.checkout, from))),
      },
    ]);
  return {
    ...f,
    movePolicy,
    sourceKinds: profileKinds,
    extraFolderPolicies,
    put,
    source,
    command,
  };
}
