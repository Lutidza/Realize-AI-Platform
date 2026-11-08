/**
 * @file .ai/tools/engineering/test/commonJsMove.fixture.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Переиспользует ESM graph и native ports для исполняемых CJS/CTS fixtures.
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
import ts from "typescript";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { renderSourceTemplate } from "../src/renderSourceTemplate.util.ts";
import { esmKinds, esmMoveData } from "./esmMove.fixture.ts";
import {
  filesystemFixture,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

export function commonJsMoveData(
  extension: "cjs" | "cts" = "cjs",
  sourceRoot = "src",
) {
  const base = esmMoveData(sourceRoot, extension === "cts" ? "mts" : "mjs");
  const mapped = (path: string) =>
    path.replace(/\.(?:mjs|mts)$/, "." + extension);
  const files = new Map<string, string>();
  for (const [path, original] of base.files) {
    const body = original.replaceAll(".mjs", ".cjs");
    files.set(
      mapped(path),
      extension === "cjs"
        ? ts
            .transpileModule(body, {
              fileName: "fixture.ts",
              compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
              },
            })
            // Authored CJS fixture не нуждается в emit-only инициализации class export.
            .outputText.replace(/^exports\.\w+ = void 0;\r?\n/gm, "")
        : body,
    );
  }
  const consumer = mapped(base.consumer);
  if (extension === "cjs")
    files.set(
      consumer,
      'const { calculateTotal } = require("./feature/calculateTotal.util.cjs");\nconst { readPrice } = require("./feature/readPrice.service.cjs");\nfunction useTotal() { return calculateTotal(); }\nasync function loadTotal() { return (await import("./feature/calculateTotal.util.cjs")).calculateTotal(); }\nmodule.exports = { useTotal, readPrice, loadTotal };',
    );
  else {
    files.set(
      base.directory + "/readPrice.service.cts",
      'const adapter: typeof import("./requestPrice.adapter.cjs") = require("./requestPrice.adapter.cjs");\nexport function readPrice(): number { return adapter.requestPrice(); }',
    );
    files.set(
      base.directory + "/requestPrice.adapter.cts",
      'import price = require("./Price.adapter.cjs");\nexport function requestPrice(): number { return new price.PriceAdapter().read(); }',
    );
  }
  return {
    ...base,
    files,
    consumer,
    from: mapped(base.from),
    to: mapped(base.to),
    members: base.members.map(mapped),
    extension,
  };
}

export function commonJsMoveFixture(
  native: LoadEngineeringNativeInput,
  root?: string,
  extension: "cjs" | "cts" = "cjs",
  sourceRoot = "src",
) {
  const data = commonJsMoveData(extension, sourceRoot);
  const extraFolderPolicies =
    sourceRoot === "src"
      ? []
      : [
          {
            id: "commonjs-tool",
            version: "1",
            root: sourceRoot,
            ownerRef: "fixture",
            purpose: "CommonJS инструменты",
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
        descriptionRu: "Проверяет исполняемый CommonJS модуль.",
        createdOn: "2026-10-30",
      }),
    );
  if (!root) {
    put("package.json", '{"name":"commonjs-fixture","type":"module"}');
    put(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "CommonJS",
          moduleResolution: "node10",
          ignoreDeprecations: "6.0",
          allowJs: extension === "cjs",
          checkJs: extension === "cjs",
          noEmit: true,
          strict: true,
          types: ["node"],
          typeRoots: [resolve("node_modules/@types")],
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

/** В известном fixture ожидается один и тот же результат require и dynamic import. */
export function runCommonJsNode(checkout: string, consumer: string) {
  const start = Date.now();
  const value = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=commonjs",
        "--eval",
        "const m=require(process.argv[1]);m.loadTotal().then(v=>console.log(JSON.stringify([m.useTotal(),m.readPrice(),v])));",
        join(checkout, consumer),
      ],
      { cwd: checkout, encoding: "utf8", timeout: 30_000 },
    ),
  );
  assert.deepEqual(value, [42, 41, 42]);
  return { runtime: process.version, value, durationMs: Date.now() - start };
}

/** CJS проверяется без emit, CTS — с emit вне authored inventory; только собственный graph. */
export function checkCommonJsGraph(
  checkout: string,
  consumer: string,
  extension: "cjs" | "cts",
  execute = true,
) {
  const output =
    extension === "cts" && execute
      ? mkdtempSync(join(homedir(), ".cache", "engineering-cts-emit-"))
      : undefined;
  try {
    const start = Date.now(),
      args = [
        resolve("node_modules/typescript/bin/tsc"),
        "--project",
        join(checkout, "tsconfig.json"),
        "--skipLibCheck",
      ];
    if (output)
      args.push(
        "--noEmit",
        "false",
        "--noEmitOnError",
        "true",
        "--rootDir",
        checkout,
        "--outDir",
        output,
      );
    execFileSync(process.execPath, args, { encoding: "utf8", timeout: 60_000 });
    const compiler = {
      status: "passed" as const,
      durationMs: Date.now() - start,
      emit: !!output,
    };
    if (output)
      writeFileSync(join(output, "package.json"), '{"type":"module"}');
    const node = execute
      ? runCommonJsNode(output ?? checkout, consumer.replace(/\.cts$/, ".cjs"))
      : null;
    return { compiler, node, cleanup: true };
  } finally {
    if (output) {
      rmSync(output, { recursive: true, force: true });
      assert.equal(existsSync(output), false);
    }
  }
}
