/**
 * @file .ai/tools/engineering/test/esmMove.fixture.ts
 * @version 1.1.0
 * @date 2026-10-30
 * @description Собирает общие MJS/MTS graphs на существующих native fixtures и проверяет его Node/checkJs.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { packageExportsMoveFixture } from "./packageExportsMove.fixture.ts";
import { renderSourceTemplate } from "../src/renderSourceTemplate.util.ts";
import {
  filesystemFixture,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

export const esmKinds = ["source.util", "source.service", "source.adapter"];
export function esmMoveData(
  sourceRoot = "src",
  extension: "mjs" | "mts" = "mjs",
) {
  const directory = sourceRoot + "/feature",
    destination = sourceRoot + "/moved/feature";
  const files = new Map([
    [
      directory + "/calculateTotal.util.mjs",
      'import { readPrice } from "./readPrice.service.mjs";\nexport function calculateTotal() { return readPrice() + 1; }',
    ],
    [
      directory + "/readPrice.service.mjs",
      'import { requestPrice } from "./requestPrice.adapter.mjs";\nexport function readPrice() { return requestPrice(); }',
    ],
    [
      directory + "/requestPrice.adapter.mjs",
      'import { PriceAdapter } from "./Price.adapter.mjs";\nexport function requestPrice() { return new PriceAdapter().read(); }',
    ],
    [
      directory + "/Price.adapter.mjs",
      'import { basePrice } from "../shared/basePrice.util.mjs";\nexport class PriceAdapter { read() { return basePrice(); } }',
    ],
    [
      sourceRoot + "/shared/basePrice.util.mjs",
      "export function basePrice() { return 41; }",
    ],
    [
      sourceRoot + "/useTotal.service.mjs",
      'import { calculateTotal } from "./feature/calculateTotal.util.mjs";\nexport { readPrice } from "./feature/readPrice.service.mjs";\nexport function useTotal() { return calculateTotal(); }\nexport async function loadTotal() { return (await import("./feature/calculateTotal.util.mjs")).calculateTotal(); }',
    ],
  ]);
  if (extension === "mts") {
    for (const [path, body] of [...files]) {
      files.delete(path);
      files.set(
        path.replace(/\.mjs$/, ".mts"),
        body
          .replaceAll("() {", "(): number {")
          .replace("loadTotal(): number", "loadTotal(): Promise<number>"),
      );
    }
  }
  const members = [...files.keys()].filter((path) =>
    path.startsWith(directory + "/"),
  );
  const consumer = sourceRoot + "/useTotal.service." + extension,
    from = members[0],
    to = sourceRoot + "/moved/calculateTotal.util." + extension;
  const movePolicy = {
    changedOn: "2026-10-30",
    coverage: "complete" as const,
    referenceRoots: [sourceRoot],
    sourcePaths: [policySource],
  };
  return {
    files,
    directory,
    destination,
    members,
    consumer,
    from,
    to,
    movePolicy,
    sourceRoot,
    extension,
  };
}

export function esmMoveFixture(
  native: LoadEngineeringNativeInput,
  root?: string,
  sourceRoot = "src",
  extension: "mjs" | "mts" = "mjs",
) {
  const data = esmMoveData(sourceRoot, extension);
  const extraFolderPolicies =
    sourceRoot === "src"
      ? []
      : [
          {
            id: "esm-tool",
            version: "1",
            root: sourceRoot,
            ownerRef: "fixture",
            purpose: "ESM инструменты",
            boundary: "owner" as const,
            allowedKinds: esmKinds,
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
    extraFolderPolicies,
    esmKinds,
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
        descriptionRu: "Проверяет исполняемый ESM модуль.",
        createdOn: "2026-10-30",
      }),
    );
  if (!root) {
    put("package.json", '{"name":"mjs-fixture","type":"commonjs"}');
    put(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          allowJs: extension === "mjs",
          checkJs: extension === "mjs",
          noEmit: true,
          strict: true,
          types: [],
        },
        include: [sourceRoot + "/**/*." + extension],
      }),
    );
    for (const [path, body] of data.files) source(path, body);
    mkdirSync(join(f.checkout, sourceRoot, "moved"), { recursive: true });
  }
  const command = (directory = false, from = data.from) =>
    planCommand([
      {
        kind: "move",
        from: directory ? data.directory : from,
        to: directory
          ? data.destination
          : data.sourceRoot + "/moved/" + from.split("/").at(-1),
        expectedVersion: directory
          ? f.ports.directoryVersion(data.directory)
          : sha256Bytes(readFileSync(join(f.checkout, from))),
      },
    ]);
  return {
    ...f,
    ...data,
    extraFolderPolicies,
    sourceKinds: esmKinds,
    put,
    source,
    command,
  };
}

/** Обе ESM формы используют прежний workspace fixture и одинаковые exports/links. */
export function esmPackageMoveFixture(
  native: LoadEngineeringNativeInput,
  extension: "mjs" | "mts" = "mjs",
) {
  const f = packageExportsMoveFixture(native);
  const mapped = (path: string) => path.replace(/\.ts$/, "." + extension);
  const files = new Map<string, string>();
  for (const [path, original] of f.files) {
    let text = original;
    if (path.endsWith(".ts")) {
      text = text
        .replace(path, mapped(path))
        .replace(
          /(["'])(\.{1,2}\/[^"']+)\1/g,
          (_, quote, specifier) =>
            quote + specifier.replace(/\.[jt]s$/, "") + ".mjs" + quote,
        );
      rmSync(join(f.checkout, path));
    } else if (path.endsWith("package.json")) {
      text = text.replaceAll(".util.js", ".util.mjs");
    } else if (path.endsWith("tsconfig.json")) {
      const config = JSON.parse(text);
      config.compilerOptions.allowJs = extension === "mjs";
      config.compilerOptions.checkJs = extension === "mjs";
      text = JSON.stringify(config);
    }
    files.set(mapped(path), text);
    f.put(mapped(path), text);
  }
  const from = mapped(f.from),
    to = mapped(f.to);
  const command = (directory = false) =>
    planCommand([
      {
        kind: "move",
        from: directory ? f.sourceDirectory : from,
        to: directory ? f.targetDirectory : to,
        expectedVersion: directory
          ? f.ports.directoryVersion(f.sourceDirectory)
          : sha256Bytes(readFileSync(join(f.checkout, from))),
      },
    ]);
  return {
    ...f,
    files,
    from,
    to,
    members: f.members.map(mapped),
    consumers: f.consumers.map(mapped),
    command,
  };
}

/** Только известный fixture graph: новое Node process исключает reuse старого module cache. */
export function runMjsOracle(checkout: string, consumer: string) {
  const start = Date.now();
  const value = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        "const m=await import(process.argv[1]);console.log(JSON.stringify([m.useTotal(),m.readPrice(),await m.loadTotal()]));",
        pathToFileURL(join(checkout, consumer)).href,
      ],
      { encoding: "utf8", timeout: 30_000, cwd: checkout },
    ),
  );
  assert.deepEqual(value, [42, 41, 42]);
  return { runtime: process.version, value, durationMs: Date.now() - start };
}

export function checkEsmTypes(checkout: string) {
  const start = Date.now();
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/typescript/bin/tsc"),
      "--project",
      join(checkout, "tsconfig.json"),
      "--skipLibCheck",
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
  return { status: "passed" as const, durationMs: Date.now() - start };
}

/** Компиляция известного MTS graph вне source inventory; выполняются только собственные fixtures. */
export function runMtsOracle(checkout: string, consumer: string) {
  const output = mkdtempSync(
    join(homedir(), ".cache", "engineering-mts-emit-"),
  );
  try {
    const start = Date.now();
    execFileSync(
      process.execPath,
      [
        resolve("node_modules/typescript/bin/tsc"),
        "--project",
        join(checkout, "tsconfig.json"),
        "--noEmit",
        "false",
        "--noEmitOnError",
        "true",
        "--rootDir",
        checkout,
        "--outDir",
        output,
        "--skipLibCheck",
      ],
      { encoding: "utf8", timeout: 60_000 },
    );
    const compiler = {
      status: "passed" as const,
      durationMs: Date.now() - start,
    };
    writeFileSync(join(output, "package.json"), '{"type":"commonjs"}');
    const emittedConsumer = consumer.replace(/\.mts$/, ".mjs");
    const node = runMjsOracle(output, emittedConsumer);
    return { compiler, node, emittedConsumer, cleanup: true };
  } finally {
    rmSync(output, { recursive: true, force: true });
    assert.equal(existsSync(output), false);
  }
}
