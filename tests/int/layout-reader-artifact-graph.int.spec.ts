// @vitest-environment node
/**
 * @file tests/int/layout-reader-artifact-graph.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-21
 * @description Проверяет привязку artifact graph к runtime API entry и client manifest страницы оформления.
 * @see documentation/reports/2026-11-21-layout-reader-delivery-rollback-audit.md
 */
import { describe, expect, it } from "vitest";
import {
  selectClientManifestFiles,
  selectServerEntryFiles,
} from "../../scripts/runtime/layout-reader/webpackArtifactLoader.adapter.mjs";
import { sha256 } from "../../scripts/runtime/layout-reader/readLayoutReaderArtifact.adapter.mjs";

const serverEntryPath = ".next/server/app/(payload)/api/[...slug]/route.js";
const manifestPath =
  ".next/server/app/(system-admin)/system/appearance/page_client-reference-manifest.js";
const appearanceRoute = "/(system-admin)/system/appearance/page";
const extensionManagerOwner =
  "/snapshot/src/components/admin/extensions/ExtensionManager.component.tsx";

function file(path: string, source: string, side = "server") {
  return { path, source, side, hash: sha256(source) };
}

function serverEntry(source?: string) {
  return file(
    serverEntryPath,
    source ??
      '(()=>{var a={};a.id=9,a.ids=[9],a.modules={15:(m)=>{throw Error("startup must not execute")}};var b=require("../../../../webpack-runtime.js");b.C(a);var c=b.X(0,[2],()=>b(b.s=15));module.exports=c})();',
  );
}

const serverChunk = () =>
  file(".next/server/chunks/2.js", "exports.modules={2:()=>{}};");

function manifest(
  lhs = `globalThis.__RSC_MANIFEST[${JSON.stringify(appearanceRoute)}]`,
  prefix = "globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});",
  clientModules: Record<string, { chunks: string[] }> = {
    [extensionManagerOwner]: {
      chunks: ["7", "static/chunks/appearance.js"],
    },
  },
) {
  return file(
    manifestPath,
    `${prefix}${lhs}={"clientModules":${JSON.stringify(clientModules)}};`,
  );
}

const clientChunk = () =>
  file(
    ".next/static/chunks/appearance.js",
    "(self.webpackChunk_N_E=[]).push([[7],{}]);",
    "client",
  );

describe("Bound server API artifact graph", () => {
  it("читает только runtime.X граф зарегистрированного API entry без исполнения startup", () => {
    const entry = serverEntry();
    const required = serverChunk();
    const unrelated = file(
      ".next/server/chunks/3.js",
      'throw Error("unrelated chunk");',
    );
    expect(
      selectServerEntryFiles([entry, required, unrelated], serverEntryPath),
    ).toEqual([entry, required]);
  });

  it("не использует nested.X внутри factory как второй runtime graph", () => {
    const entry = serverEntry(
      serverEntry().source.replace(
        'throw Error("startup must not execute")',
        "const unrelated={X:()=>{}};unrelated.X(0,[777],()=>{})",
      ),
    );
    expect(
      selectServerEntryFiles([entry, serverChunk()], serverEntryPath),
    ).toHaveLength(2);
  });

  it.each([
    [
      "runtime substitution",
      'require("../../../../webpack-runtime.js")',
      'require("../../../../other/webpack-runtime.js")',
    ],
    [
      "external runtime",
      'require("../../../../webpack-runtime.js")',
      'require("node:fs")',
    ],
    ["incorrect X receiver", "c=b.X(", "c=other.X("],
    ["incorrect C receiver", "b.C(a)", "other.C(a)"],
    ["incorrect registered object", "b.C(a)", "b.C(other)"],
    ["unregistered owner", "b.C(a);", ""],
    ["incorrect root receiver", "()=>b(b.s=15)", "()=>other(b.s=15)"],
    ["incorrect root binding", "()=>b(b.s=15)", "()=>b(other.s=15)"],
    ["undeclared root factory", "()=>b(b.s=15)", "()=>b(b.s=16)"],
    ["unbound root callback", "()=>b(b.s=15)", "()=>b(15)"],
    ["unbound module export", "module.exports=c", "module.exports=other"],
    ["inconsistent entry owner IDs", "a.ids=[9]", "a.ids=[10]"],
    ["duplicate graph dependency", "b.X(0,[2],", "b.X(0,[2,2],"],
    ["computed receiver property", "b.X(0,", 'b["X"](0,'],
  ])("отклоняет %s", (_label, before, after) => {
    const entry = serverEntry(serverEntry().source.replace(before, after));
    expect(() =>
      selectServerEntryFiles([entry, serverChunk()], serverEntryPath),
    ).toThrow();
  });

  it("не принимает произвольный nested.X вместо startup owner graph", () => {
    const entry = serverEntry(
      '(()=>{const fake=()=>{var b=require("../../../../webpack-runtime.js");b.X(0,[2],()=>b(15))};module.exports=fake})();',
    );
    expect(() =>
      selectServerEntryFiles([entry, serverChunk()], serverEntryPath),
    ).toThrow();
  });

  it("отклоняет runtime mutation и запуск до регистрации entry owner", () => {
    for (const source of [
      serverEntry().source.replace("b.C(a);", "b.X=other;b.C(a);"),
      serverEntry().source.replace(
        "b.C(a);var c=b.X(0,[2],()=>b(b.s=15));",
        "var c=b.X(0,[2],()=>b(b.s=15));b.C(a);",
      ),
    ])
      expect(() =>
        selectServerEntryFiles(
          [serverEntry(source), serverChunk()],
          serverEntryPath,
        ),
      ).toThrow();
  });

  it("не заменяет owner route и не выбирает один из дубликатов файлов", () => {
    const entry = serverEntry();
    const chunk = serverChunk();
    expect(() =>
      selectServerEntryFiles(
        [{ ...entry, path: ".next/server/app/other/route.js" }, chunk],
        ".next/server/app/other/route.js",
      ),
    ).toThrow(/owner path/);
    expect(() =>
      selectServerEntryFiles([entry, entry, chunk], serverEntryPath),
    ).toThrow(/unique/);
    expect(() =>
      selectServerEntryFiles([entry, chunk, chunk], serverEntryPath),
    ).toThrow(/unique/);
  });
});

describe("Bound appearance client manifest", () => {
  it("выбирает chunks точного globalThis registry и route key", () => {
    const selected = clientChunk();
    expect(
      selectClientManifestFiles(
        [
          manifest(),
          selected,
          file(".next/static/chunks/other.js", "", "client"),
        ],
        manifestPath,
      ),
    ).toEqual([selected]);
  });

  it("использует только graph ExtensionManager, сохраняя другие client entry contexts отдельно", () => {
    const selected = clientChunk();
    const unrelated = file(
      ".next/static/chunks/other.js",
      '(self.webpackChunk_N_E=[]).push([[8],{6881:()=>"other-context"}]);',
      "client",
    );
    const scoped = manifest(undefined, undefined, {
      [extensionManagerOwner]: { chunks: ["7", "static/chunks/appearance.js"] },
      "/snapshot/src/components/other/OtherRoute.component.tsx": {
        chunks: ["8", "static/chunks/other.js"],
      },
    });
    expect(
      selectClientManifestFiles([scoped, selected, unrelated], manifestPath),
    ).toEqual([selected]);
  });

  it("отклоняет отсутствующего owner вместо выбора union других routes", () => {
    const missing = manifest(undefined, undefined, {
      "/snapshot/src/components/other/OtherRoute.component.tsx": {
        chunks: ["7", "static/chunks/appearance.js"],
      },
    });
    expect(() =>
      selectClientManifestFiles([missing, clientChunk()], manifestPath),
    ).toThrow(/owner module must be unique/);
  });

  it("не выбирает первый из двух manifest keys с owner suffix", () => {
    const duplicate = manifest(undefined, undefined, {
      [extensionManagerOwner]: { chunks: ["7", "static/chunks/appearance.js"] },
      "/other-snapshot/src/components/admin/extensions/ExtensionManager.component.tsx":
        {
          chunks: ["8", "static/chunks/other.js"],
        },
    });
    expect(() =>
      selectClientManifestFiles([duplicate, clientChunk()], manifestPath),
    ).toThrow(/owner module must be unique/);
  });

  it.each([
    "other.manifest",
    `other.__RSC_MANIFEST[${JSON.stringify(appearanceRoute)}]`,
    `self.__RSC_MANIFEST[${JSON.stringify(appearanceRoute)}]`,
    `globalThis.other[${JSON.stringify(appearanceRoute)}]`,
    'globalThis.__RSC_MANIFEST["/appearance"]',
    'globalThis.__RSC_MANIFEST["/(system-admin)/system/other/page"]',
    `globalThis.__RSC_MANIFEST[${JSON.stringify(appearanceRoute)}+""]`,
  ])("отклоняет подмену manifest LHS %s", (lhs) => {
    expect(() =>
      selectClientManifestFiles([manifest(lhs), clientChunk()], manifestPath),
    ).toThrow(/bound/);
  });

  it("отклоняет подменённый initializer и nested manifest assignment", () => {
    const wrongInitializer = manifest(undefined, "other.__RSC_MANIFEST={};");
    const nested = manifest();
    nested.source = `function unrelated(){${nested.source}}`;
    for (const candidate of [wrongInitializer, nested])
      expect(() =>
        selectClientManifestFiles([candidate, clientChunk()], manifestPath),
      ).toThrow(/bound/);
  });

  it("не подменяет manifest owner file и не принимает дубликаты", () => {
    const selected = manifest();
    expect(() =>
      selectClientManifestFiles(
        [{ ...selected, path: "manifest.js" }, clientChunk()],
        "manifest.js",
      ),
    ).toThrow(/owner path/);
    expect(() =>
      selectClientManifestFiles(
        [selected, selected, clientChunk()],
        manifestPath,
      ),
    ).toThrow(/unique/);
  });

  it("требует наличие объявленного chunk в нужной стороне artifact", () => {
    expect(() =>
      selectClientManifestFiles(
        [manifest(), { ...clientChunk(), side: "server" }],
        manifestPath,
      ),
    ).toThrow(/absent/);
  });
});
