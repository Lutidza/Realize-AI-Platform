/**
 * @file .ai/tools/engineering/test/aliasMove.fixture.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Готовит native source.util move с read-only tsconfig за пределами source roots.
 * @see documentation/architecture/engineering-operations.md
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { renderSourceTemplate } from "../src/renderSourceTemplate.util.ts";
import {
  filesystemFixture,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

export function aliasMoveFixture(
  native: LoadEngineeringNativeInput,
  root?: string,
  configWrite: boolean | string = false,
  shared = false,
  projectConfigPaths?: readonly string[],
) {
  const configPath =
    typeof configWrite === "string" ? configWrite : "tsconfig.json";
  const movePolicy = {
    changedOn: "2026-10-29",
    coverage: "complete" as const,
    referenceRoots: shared
      ? ["src/lib/code", "src/app-a/code", "src/app-b/code"]
      : ["src"],
    sourcePaths: [policySource],
    ...(configWrite
      ? {
          tsconfigWrite: {
            path: configPath,
            allConsumersInReferenceRoots: true as const,
            ...(projectConfigPaths ? { projectConfigPaths } : {}),
          },
        }
      : {}),
  };
  const extraFolderPolicies = configWrite
    ? [
        {
          id: "tsconfig",
          version: "1",
          root: configPath,
          ownerRef: "fixture-config",
          purpose: "Настройки алиасов",
          boundary: "contracts" as const,
          allowedKinds: ["config.tsconfig"],
          allowedProvenance: ["authored" as const],
          sourcePaths: [policySource],
        },
      ]
    : [];
  const f = filesystemFixture(
    native,
    root,
    undefined,
    [],
    movePolicy,
    extraFolderPolicies,
  );
  const from = shared
      ? "src/lib/code/math/calculateTotal.util.ts"
      : "src/math/calculateTotal.util.ts",
    to = shared
      ? "src/app-b/code/pricing/calculateTotal.util.ts"
      : "src/pricing/calculateTotal.util.ts",
    consumer = shared
      ? "src/app-a/code/useTotal.util.ts"
      : "src/useTotal.util.ts",
    relativeConsumer = shared
      ? "src/app-b/code/readTotal.util.ts"
      : "src/readTotal.util.ts";
  const put = (path: string, text: string | Uint8Array) => {
    mkdirSync(dirname(join(f.checkout, path)), { recursive: true });
    writeFileSync(join(f.checkout, path), text);
  };
  const utility = (path: string, body: string) =>
    put(
      path,
      renderSourceTemplate({
        path,
        body,
        descriptionRu: "Вычисляет сумму для сценария переноса.",
        createdOn: "2026-10-26",
      }),
    );
  const configure = (
    paths: Record<string, string[]> = { "@app/*": ["src/*"] },
    extra: object = {},
  ) =>
    put(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { moduleResolution: "bundler", baseUrl: ".", paths },
        ...extra,
      }),
    );
  if (!root) {
    for (const path of [...movePolicy.referenceRoots, dirname(to)])
      mkdirSync(join(f.checkout, path), { recursive: true });
    configure();
    utility(from, "export function calculateTotal() { return 42; }");
    utility(
      consumer,
      `import { calculateTotal } from "@app/${from.slice(4, -3)}";\nexport function useTotal() { return calculateTotal(); }`,
    );
  }
  const command = (source = from, target = to) =>
    planCommand([
      {
        kind: "move",
        from: source,
        to: target,
        expectedVersion: sha256Bytes(readFileSync(join(f.checkout, source))),
      },
    ]);
  return {
    ...f,
    from,
    to,
    consumer,
    relativeConsumer,
    movePolicy,
    extraFolderPolicies,
    put,
    utility,
    configure,
    command,
  };
}
