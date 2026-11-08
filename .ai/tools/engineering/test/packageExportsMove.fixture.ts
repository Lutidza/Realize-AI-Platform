/**
 * @file .ai/tools/engineering/test/packageExportsMove.fixture.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Готовит workspace packages и compiler links для реального native exports move.
 * @see documentation/architecture/engineering-operations.md
 */
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { renderSourceTemplate } from "../src/renderSourceTemplate.util.ts";
import {
  filesystemFixture,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

export function packageExportsData(rootExport = false, glob = true) {
  const sourceDirectory = "packages/math/src/domain",
    targetDirectory = "packages/math/src/pricing/domain";
  const from = sourceDirectory + "/calculateTotal.util.ts",
    to = "packages/math/src/pricing/calculateTotal.util.ts";
  const members = [
    from,
    sourceDirectory + "/detail/roundPrice.util.ts",
    sourceDirectory + "/unusedTotal.util.ts",
  ];
  const consumers = [
    "packages/app/src/useTotal.util.ts",
    "packages/app/src/readTotal.util.ts",
  ];
  const configOwner = "packages/math/package.json",
    names = ["math", "app", "shared"];
  const referenceRoots = names.map((name) => `packages/${name}/src`),
    consumerConfigs = names.map((name) => `packages/${name}/tsconfig.json`);
  const files = new Map<string, string>();
  const utility = (path: string, body: string) =>
    files.set(
      path,
      Buffer.from(
        renderSourceTemplate({
          path,
          body,
          descriptionRu: "Проверяет перенос публичного модуля.",
          createdOn: "2026-10-30",
        }),
      ).toString("utf8"),
    );
  utility(
    from,
    'import { roundPrice } from "./detail/roundPrice.util";\nimport { sharedValue } from "@fixture/shared";\nexport function calculateTotal() { return roundPrice() + sharedValue(); }',
  );
  utility(members[1], "export function roundPrice() { return 42; }");
  utility(members[2], "export function unusedTotal() { return 7; }");
  utility(
    consumers[0],
    'import { calculateTotal } from "@fixture/math";\nexport function useTotal() { return calculateTotal(); }',
  );
  utility(
    consumers[1],
    `export { calculateTotal } from "@fixture/math${rootExport ? "" : "/total"}";\nexport function readTotal() { return 0; }`,
  );
  utility(
    "packages/shared/src/sharedValue.util.ts",
    "export function sharedValue() { return 1; }",
  );
  files.set(
    "package.json",
    JSON.stringify({
      name: "fixture-workspace",
      private: true,
      type: "module",
      workspaces: glob
        ? ["packages/*"]
        : names.map((name) => `packages/${name}`),
    }),
  );
  files.set(
    configOwner,
    "\uFEFF" +
      JSON.stringify(
        {
          name: "@fixture/math",
          version: "1.0.0",
          type: "module",
          exports: rootExport
            ? "./src/domain/calculateTotal.util.js"
            : {
                ".": "./src/domain/calculateTotal.util.js",
                "./total": "./src/domain/calculateTotal.util.js",
                "./unused-total": "./src/domain/calculateTotal.util.js",
                "./round": "./src/domain/detail/roundPrice.util.js",
                "./unused": "./src/domain/unusedTotal.util.js",
              },
        },
        null,
        2,
      ).replaceAll("\n", "\r\n") +
      "\r\n",
  );
  for (const name of ["app", "shared"])
    files.set(
      `packages/${name}/package.json`,
      JSON.stringify({
        name: `@fixture/${name}`,
        type: "module",
        exports: `./src/${name === "app" ? "useTotal" : "sharedValue"}.util.js`,
      }),
    );
  for (const path of consumerConfigs)
    files.set(
      path,
      JSON.stringify({
        compilerOptions: {
          target: "ES2018",
          module: "ESNext",
          moduleResolution: "bundler",
          noEmit: true,
          strict: true,
          types: [],
        },
        include: ["src/**/*"],
      }),
    );
  const movePolicy = {
    changedOn: "2026-10-30",
    coverage: "complete" as const,
    referenceRoots,
    sourcePaths: [policySource],
    packageExportsWrite: {
      path: configOwner,
      workspaceRoots: ["packages"],
      allConsumersInReferenceRoots: true as const,
    },
  };
  return {
    files,
    from,
    to,
    sourceDirectory,
    targetDirectory,
    members,
    consumers,
    consumerConfigs,
    configOwner,
    referenceRoots,
    movePolicy,
  };
}

export function packageExportsMoveFixture(
  native: LoadEngineeringNativeInput,
  root?: string,
  rootExport = false,
  glob = true,
) {
  const data = packageExportsData(rootExport, glob);
  const extraFolderPolicies = data.referenceRoots.map((path) => ({
    id: path,
    version: "1",
    root: path,
    ownerRef: dirname(path),
    purpose: "Исходники workspace",
    boundary: "owner" as const,
    allowedKinds: ["source.util"],
    allowedProvenance: ["authored" as const],
    sourcePaths: [policySource],
  }));
  const policies = [
    ...extraFolderPolicies,
    {
      id: "package-exports",
      version: "1",
      root: data.configOwner,
      ownerRef: "packages/math",
      purpose: "Публичные exports",
      boundary: "contracts" as const,
      allowedKinds: ["config.package-exports"],
      allowedProvenance: ["authored" as const],
      sourcePaths: [policySource],
    },
  ];
  const f = filesystemFixture(
    native,
    root,
    undefined,
    [],
    data.movePolicy,
    policies,
  );
  const put = (path: string, text: string | Uint8Array) => {
    mkdirSync(dirname(join(f.checkout, path)), { recursive: true });
    writeFileSync(join(f.checkout, path), text);
  };
  if (!root) {
    for (const [path, text] of data.files) put(path, text);
    mkdirSync(join(f.checkout, dirname(data.to)), { recursive: true });
    mkdirSync(join(f.checkout, "node_modules/@fixture"), { recursive: true });
    for (const name of ["math", "app", "shared"])
      symlinkSync(
        join(f.checkout, "packages", name),
        join(f.checkout, "node_modules/@fixture", name),
        "dir",
      );
  }
  const command = (directory = false) =>
    planCommand([
      {
        kind: "move",
        from: directory ? data.sourceDirectory : data.from,
        to: directory ? data.targetDirectory : data.to,
        expectedVersion: directory
          ? f.ports.directoryVersion(data.sourceDirectory)
          : sha256Bytes(readFileSync(join(f.checkout, data.from))),
      },
    ]);
  return { ...f, ...data, extraFolderPolicies: policies, put, command };
}
