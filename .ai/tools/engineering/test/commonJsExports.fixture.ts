/**
 * @file .ai/tools/engineering/test/commonJsExports.fixture.ts
 * @version 1.0.0
 * @date 2026-11-02
 * @description Расширяет прежний workspace fixture CommonJS sources и compiler/Node oracle.
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
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { packageExportsMoveFixture } from "./packageExportsMove.fixture.ts";
import { planCommand } from "./filesystemIntegration.fixture.ts";
import { renderSourceTemplate } from "../src/renderSourceTemplate.util.ts";

export function commonJsExportsFixture(
  native: LoadEngineeringNativeInput,
  root?: string,
  extension: "cjs" | "cts" = "cjs",
  rootExport = false,
  glob = true,
) {
  const f = packageExportsMoveFixture(native, root, rootExport, glob);
  const mapped = (path: string) => path.replace(/\.ts$/, "." + extension);
  const subpath = "@fixture/math" + (rootExport ? "" : "/total");
  const files = new Map<string, string>();
  const options = {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    allowJs: extension === "cjs",
    checkJs: extension === "cjs",
    noEmit: true,
    strict: true,
    types: ["node"],
    typeRoots: [resolve("node_modules/@types")],
  };
  for (const [path, original] of f.files) {
    let text = original;
    if (path.endsWith(".ts")) {
      let body = original
        .slice(original.indexOf("*/") + 2)
        .trimStart()
        .replace(
          /(["'])(\.{1,2}\/[^"']+)\1/g,
          (_, quote, specifier) =>
            quote + specifier.replace(/\.[jt]s$/, "") + ".cjs" + quote,
        );
      if (extension === "cjs")
        body = ts.transpileModule(body, {
          fileName: "fixture.ts",
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText;
      if (path === f.consumers[0])
        body =
          extension === "cts"
            ? 'const price: typeof import("@fixture/math") = require("@fixture/math");\nexport function useTotal(): number { return price.calculateTotal(); }'
            : 'const price = require("@fixture/math");\nfunction useTotal(){return price.calculateTotal();}\nmodule.exports={useTotal};';
      if (path === f.consumers[1])
        body =
          extension === "cts"
            ? `const price: typeof import("${subpath}") = require("${subpath}");\nexport function readTotal(): number {return price.calculateTotal();}\nexport async function loadTotal(): Promise<number> {return (await import("@fixture/math")).calculateTotal();}`
            : `const price = require("${subpath}");\nfunction readTotal(){return price.calculateTotal();}\nasync function loadTotal(){return (await import("@fixture/math")).calculateTotal();}\nmodule.exports={readTotal,loadTotal};`;
      text = Buffer.from(
        renderSourceTemplate({
          path: mapped(path),
          body,
          createdOn: "2026-11-02",
          descriptionRu: "Проверяет CommonJS workspace exports.",
        }),
      ).toString();
      if (!root) rmSync(join(f.checkout, path));
    } else if (path.endsWith("package.json"))
      text = text.replaceAll(".util.js", ".util.cjs");
    else if (path.endsWith("tsconfig.json"))
      text = JSON.stringify({
        compilerOptions: options,
        include: ["src/**/*"],
      });
    files.set(mapped(path), text);
  }
  const self = "packages/math/src/readSelf.util." + extension;
  files.set(
    self,
    Buffer.from(
      renderSourceTemplate({
        path: self,
        createdOn: "2026-11-02",
        descriptionRu: "Проверяет self reference пакета.",
        body:
          extension === "cts"
            ? 'const price: typeof import("@fixture/math") = require("@fixture/math");\nexport function readSelf(): number {return price.calculateTotal();}'
            : 'const price=require("@fixture/math");\nfunction readSelf(){return price.calculateTotal();}\nmodule.exports={readSelf};',
      }),
    ).toString(),
  );
  // Один compiler project покрывает весь известный graph с теми же options, что nearest configs.
  files.set(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: options,
      include: ["packages/*/src/**/*." + extension],
    }),
  );
  if (!root) for (const [path, text] of files) f.put(path, text);
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
    self,
    extension,
    members: f.members.map(mapped),
    consumers: f.consumers.map(mapped),
    command,
  };
}

/** Только собственный workspace graph: fresh Node, source checkJs либо CTS emit вне inventory. */
export function checkCommonJsExportsGraph(
  checkout: string,
  extension: "cjs" | "cts",
) {
  const output =
    extension === "cts"
      ? mkdtempSync(join(homedir(), ".cache", "engineering-package-cts-"))
      : undefined;
  try {
    const start = Date.now();
    const args = [
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
    if (output) {
      for (const path of [
        "package.json",
        ...["math", "app", "shared"].map(
          (name) => `packages/${name}/package.json`,
        ),
      ]) {
        mkdirSync(dirname(join(output, path)), { recursive: true });
        writeFileSync(join(output, path), readFileSync(join(checkout, path)));
      }
      mkdirSync(join(output, "node_modules/@fixture"), { recursive: true });
      for (const name of ["math", "app", "shared"])
        symlinkSync(
          join(output, "packages", name),
          join(output, "node_modules/@fixture", name),
          "dir",
        );
    }
    const runtimeStart = Date.now();
    const value = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=commonjs",
          "--eval",
          'const a=require("./packages/app/src/useTotal.util.cjs"),b=require("./packages/app/src/readTotal.util.cjs"),s=require("./packages/math/src/readSelf.util.cjs");b.loadTotal().then(v=>console.log(JSON.stringify([a.useTotal(),b.readTotal(),v,s.readSelf()])));',
        ],
        { cwd: output ?? checkout, encoding: "utf8", timeout: 30_000 },
      ),
    );
    assert.deepEqual(value, [43, 43, 43, 43]);
    return {
      compiler,
      node: {
        runtime: process.version,
        durationMs: Date.now() - runtimeStart,
        value,
      },
      cleanup: true,
    };
  } finally {
    if (output) {
      rmSync(output, { recursive: true, force: true });
      assert.equal(existsSync(output), false);
    }
  }
}
