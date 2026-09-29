/**
 * @file .ai/tools/agent-search/test/importResolution.test.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Проверяет статические цепочки, configuration precedence, неоднозначность и бюджеты на изолированном I/O.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import ts from "typescript";
import { resolveImportLinks } from "../src/resolveImportLinks.service.mjs";
import { createImportReadContext } from "../src/createImportReadContext.service.mjs";

function fixture(files, denied = []) {
  const reads = [];
  const adapter = {
    isAllowed: (path) => !denied.includes(path),
    async read(path, { maximumBytes, onReadBytes }) {
      reads.push(path);
      if (!Object.hasOwn(files, path)) return { status: "not_found" };
      const text = files[path];
      if (Buffer.byteLength(text) > maximumBytes)
        return { status: "file_too_large" };
      onReadBytes(Buffer.byteLength(text));
      return {
        status: "ok",
        text,
        sha256: createHash("sha256").update(text).digest("hex"),
      };
    },
    async listDirectories(path, limit) {
      const directories = [
        ...new Set(
          Object.keys(files)
            .filter(
              (file) =>
                file.startsWith(`${path}/`) &&
                file.slice(path.length + 1).includes("/"),
            )
            .map(
              (file) => `${path}/${file.slice(path.length + 1).split("/")[0]}`,
            ),
        ),
      ].sort();
      return {
        status: directories.length > limit ? "scan_budget" : "ok",
        directories,
        fingerprint: JSON.stringify(directories),
      };
    },
  };
  return {
    reads,
    run: (query = "Local", options = {}) =>
      resolveImportLinks(
        "src/main.ts",
        {
          query,
          caseSensitive: true,
          maxDepth: 8,
          coordinateUnit: "unicode_codepoints",
          ...options,
        },
        adapter,
      ),
  };
}

test("alias через barrel/re-export ведёт к исходному объявлению, каждый файл читается один раз", async () => {
  const files = {
    "tsconfig.json":
      '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
    "src/main.ts": 'import { Public as Local } from "@/barrel"; Local();',
    "src/barrel/index.ts":
      'export { Original as Public } from "../original.service.js";',
    "src/original.service.ts": "export function Original() {}",
  };
  const { run, reads } = fixture(files);
  const result = await run();
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].resolution.status, "resolved");
  assert.deepEqual(result.matches[0].resolution.target, {
    path: "src/original.service.ts",
    line: 1,
    column: 17,
    kind: "function",
    name: "Original",
    fileSha256: createHash("sha256")
      .update(files["src/original.service.ts"])
      .digest("hex"),
  });
  assert.equal(
    result.matches[0].resolution.chain[0].path,
    "src/barrel/index.ts",
  );
  assert.equal(new Set(reads).size, reads.length);
  assert.equal(result.resolution.filesRead, 4);
});

test("локальный import + export alias, default и namespace имеют разные цели", async () => {
  const base = {
    "src/main.ts": 'import { Public as Local } from "./barrel";',
    "src/barrel.ts":
      'import Original from "./actual"; export { Original as Public };',
    "src/actual.ts": "export default function Original() {}",
  };
  assert.equal(
    (await fixture(base).run()).matches[0].resolution.target.name,
    "default",
  );
  base["src/main.ts"] = 'import * as Local from "./barrel";';
  const namespace = (await fixture(base).run()).matches[0].resolution;
  assert.equal(namespace.target.kind, "module");
  assert.equal(namespace.target.path, "src/barrel.ts");
});

test("точный binding имеет приоритет над module substring до применения limit", async () => {
  const files = {
    "src/main.ts":
      'import type {Other} from "./Local.types";\nimport {Local} from "./actual";',
    "src/Local.types.ts": "export type Other = string;",
    "src/actual.ts": "export const Local = 1;",
  };
  const source = fixture(files);
  const result = await source.run("local", {
    caseSensitive: false,
    maxMatches: 1,
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].resolution.target.path, "src/actual.ts");
  assert.ok(!source.reads.includes("src/Local.types.ts"));
  assert.equal(
    (await fixture(files).run("Local.types")).matches[0].resolution.target.kind,
    "module",
  );
});

test("star exports: уникальная цель, duplicate path, ambiguity и запрет default", async () => {
  const files = {
    "src/main.ts": 'import { Local } from "./barrel";',
    "src/barrel.ts": 'export * from "./a"; export * from "./b";',
    "src/a.ts": "export const Local = 1;",
    "src/b.ts": 'export { Local } from "./a";',
  };
  assert.equal(
    (await fixture(files).run()).matches[0].resolution.target.path,
    "src/a.ts",
  );
  files["src/b.ts"] = "export const Local = 2;";
  assert.equal(
    (await fixture(files).run()).matches[0].resolution.reason,
    "ambiguous",
  );
  files["src/main.ts"] = 'import Local from "./barrel";';
  assert.equal(
    (await fixture(files).run()).matches[0].resolution.reason,
    "symbol_not_exported",
  );
});

test("cycles и maxDepth завершаются с причиной, не выдавая ложную цель", async () => {
  const files = {
    "src/main.ts": 'import { Local } from "./a";',
    "src/a.ts": 'export { Local } from "./b";',
    "src/b.ts": 'export { Local } from "./a";',
  };
  assert.equal(
    (await fixture(files).run()).matches[0].resolution.reason,
    "cycle",
  );
  files["src/b.ts"] = "export const Local = 1;";
  assert.equal(
    (await fixture(files).run("Local", { maxDepth: 1 })).matches[0].resolution
      .reason,
    "max_depth",
  );
  assert.equal(
    (await fixture(files).run("Local", { maxDepth: 2 })).matches[0].resolution
      .status,
    "resolved",
  );
});

test("workspace exports поддерживают subpaths/conditions и не обходят закрытый subpath", async () => {
  const files = {
    "package.json": '{"workspaces":["packages/*"]}',
    "tsconfig.json":
      '{"compilerOptions":{"baseUrl":".","moduleResolution":"bundler"}}',
    "src/main.ts": 'import { Local } from "@fixture/lib/feature";',
    "packages/lib/package.json":
      '{"name":"@fixture/lib","exports":{"./feature":{"import":"./source.ts","require":"./other.cts"}}}',
    "packages/lib/source.ts": "export class Local {}",
    "packages/lib/other.cts": "export class Other {}",
  };
  const result = await fixture(files).run();
  assert.equal(
    result.matches[0].resolution.target.path,
    "packages/lib/source.ts",
  );
  files["src/main.ts"] = 'import { Local } from "@fixture/lib/private";';
  assert.equal(
    (await fixture(files).run()).matches[0].resolution.reason,
    "not_found",
  );
});

test("paths exact/longest-prefix, extends origin и BOM/JSONC не угадываются", async () => {
  const files = {
    "tsconfig.json":
      '\uFEFF{/* project */ "extends":"./config/base", "compilerOptions":{"paths":{"@exact":["src/right.ts"],"@*":["src/wrong.ts"]}}}',
    "config/base.json": '{"compilerOptions":{"baseUrl":".."}}',
    "src/main.ts": 'import { Local } from "@exact";',
    "src/right.ts": "export const Local = 1;",
    "src/wrong.ts": "export const Local = 2;",
  };
  assert.equal(
    (await fixture(files).run()).matches[0].resolution.target.path,
    "src/right.ts",
  );
  files["config/base.json"] = '{"extends":"../tsconfig"}';
  assert.equal(
    (await fixture(files).run()).matches[0].resolution.reason,
    "unsupported_configuration",
  );
});

test("extension substitution и main directory совпадают с установленным TypeScript", async () => {
  for (const [specifier, candidates, expected] of [
    ["./target.jsx", ["target.tsx", "target.ts"], "target.tsx"],
    ["./target.ts", ["target.tsx", "target.js"], "target.tsx"],
    [
      "./target.service",
      ["target.d.service.ts", "target.service.ts"],
      "target.d.service.ts",
    ],
    ["./target.js", ["target.js.ts"], "target.js.ts"],
    ["./target.css", ["target.d.css.ts", "target.css.ts"], "target.d.css.ts"],
  ]) {
    const files = { "src/main.ts": `import {Local} from '${specifier}';` };
    for (const candidate of candidates)
      files[`src/${candidate}`] = "export const Local = 1;";
    const oracle = ts.resolveModuleName(
      specifier,
      "/repo/src/main.ts",
      { moduleResolution: ts.ModuleResolutionKind.Bundler },
      {
        fileExists: (path) =>
          Object.hasOwn(files, path.replace(/^\/repo\//u, "")),
        readFile: (path) => files[path.replace(/^\/repo\//u, "")],
        directoryExists: () => true,
      },
    ).resolvedModule?.resolvedFileName;
    assert.equal(oracle, `/repo/src/${expected}`);
    assert.equal(
      (await fixture(files).run()).matches[0].resolution.target.path,
      `src/${expected}`,
    );
  }
  for (const main of ["./nested", "."]) {
    const target =
      main === "." ? "src/lib/index.ts" : "src/lib/nested/index.ts";
    const files = {
      "src/main.ts": 'import {Local} from "./lib";',
      "src/lib/package.json": JSON.stringify({ main }),
      [target]: "export const Local = 1;",
    };
    assert.equal(
      (await fixture(files).run()).matches[0].resolution.target.path,
      target,
    );
  }
});

test("условия exports сохраняют порядок, nested fallback, null и pattern specificity", async () => {
  const files = {
    "src/main.ts": 'import {Local} from "@fixture/lib";',
    "package.json": '{"workspaces":["packages/*"]}',
    "packages/lib/right.ts": "export const Local = 1;",
    "packages/lib/wrong.ts": "export const Local = 2;",
  };
  for (const [exports, expected] of [
    [{ import: { browser: "./wrong.ts" }, default: "./right.ts" }, "resolved"],
    [{ default: "./right.ts", types: "./wrong.ts" }, "resolved"],
    [{ import: null, default: "./right.ts" }, "not_found"],
    [["./right.ts"], "unsupported_configuration"],
  ]) {
    files["packages/lib/package.json"] = JSON.stringify({
      name: "@fixture/lib",
      exports,
    });
    const result = (await fixture(files).run()).matches[0].resolution;
    assert.equal(result.reason ?? result.status, expected);
    if (expected === "resolved")
      assert.equal(result.target.path, "packages/lib/right.ts");
  }
  files["src/main.ts"] = 'import {Local} from "@fixture/lib/feature.ts";';
  files["packages/lib/package.json"] = JSON.stringify({
    name: "@fixture/lib",
    exports: { "./*": "./wrong.ts", "./*.ts": "./right.ts" },
  });
  assert.equal(
    (await fixture(files).run()).matches[0].resolution.target.path,
    "packages/lib/right.ts",
  );
  // Для paths при одинаковом prefix сохраняется порядок объявления, а не длина suffix.
  files["tsconfig.json"] = JSON.stringify({
    compilerOptions: {
      paths: {
        "@fixture/*": ["packages/lib/right.ts"],
        "@fixture/*.ts": ["packages/lib/wrong.ts"],
      },
    },
  });
  assert.equal(
    (await fixture(files).run()).matches[0].resolution.target.path,
    "packages/lib/right.ts",
  );
});

test("malformed workspace config даёт явную причину вместо мнимого внешнего пакета", async () => {
  for (const workspaces of [
    "packages/*",
    { packages: "packages/*" },
    [""],
    ["."],
    ["../private/*"],
  ]) {
    const result = await fixture({
      "src/main.ts": 'import {Local} from "@fixture/lib";',
      "package.json": JSON.stringify({ workspaces }),
    }).run();
    assert.equal(
      result.matches[0].resolution.reason,
      "unsupported_configuration",
    );
  }
});

test("metadata cache не превращается в source grant", async () => {
  let reads = 0;
  const context = createImportReadContext({
    isAllowed: (_path, purpose) => purpose === "config",
    read: async (_path, { onReadBytes }) => {
      reads++;
      onReadBytes(2);
      return { status: "ok", text: "{}" };
    },
    listDirectories: async () => ({ status: "not_found" }),
  });
  assert.equal((await context.read("tsconfig.json", "config")).status, "ok");
  assert.equal(
    (await context.read("tsconfig.json", "source")).status,
    "forbidden",
  );
  assert.equal(reads, 1);
  assert.equal(context.stats.bytesRead, 2);
  assert.equal(context.stats.blockedCandidates, 1);
});

test("запрещённый target и root traversal не читаются, внешние библиотеки не сканируются", async () => {
  const files = {
    "src/main.ts": 'import { Local } from "./blocked";',
    "src/blocked.ts": "export const Local = 1;",
  };
  const denied = fixture(files, ["src/blocked.ts"]);
  assert.equal((await denied.run()).matches[0].resolution.reason, "forbidden");
  assert.ok(!denied.reads.includes("src/blocked.ts"));
  files["src/main.ts"] = 'import { Local } from "../../private";';
  assert.equal(
    (await fixture(files).run()).matches[0].resolution.reason,
    "forbidden",
  );
  files["src/main.ts"] = 'import { Local } from "uninstalled-external";';
  const external = fixture(files);
  assert.equal(
    (await external.run()).matches[0].resolution.reason,
    "external_dependency",
  );
  assert.ok(external.reads.every((path) => !path.includes("node_modules")));
});

test("Unicode имя/путь, emoji, BOM/CRLF и комбинируемые marks сохраняют координаты", async () => {
  for (const name of ["Русский", "ქართული", "العربية", "漢字", "e\u0301"]) {
    const prefix = "\uFEFF/*👩🏽‍💻*/ export const ";
    const files = {
      "src/main.ts": `import {${name} as Local} from './ქართული-${name}';`,
      [`src/ქართული-${name}.ts`]: `${prefix}${name} = 1;\r\n`,
    };
    const result = (await fixture(files).run()).matches[0].resolution.target;
    assert.equal(result.name, name);
    assert.equal(result.column, [...prefix].length + 1);
    const bytes = (
      await fixture(files).run("Local", { coordinateUnit: "utf8_bytes" })
    ).matches[0].resolution.target;
    assert.equal(bytes.column, Buffer.byteLength(prefix) + 1);
  }
});

test("byte/file/deadline budgets и early consumer stop ограничивают действительное чтение", async () => {
  const files = {
    "src/main.ts": Array.from(
      { length: 12 },
      (_, n) => `import {Local as Local${n}} from './file${n}';`,
    ).join("\n"),
  };
  for (let n = 0; n < 12; n++)
    files[`src/file${n}.ts`] = `export const Local = 1;${" ".repeat(500000)}`;
  const result = await fixture(files).run("Local");
  assert.equal(result.resolution.exhausted, true);
  assert.ok(result.resolution.bytesRead <= 4194304);
  assert.ok(
    result.matches.some((match) => match.resolution.reason === "scan_budget"),
  );
  const early = fixture(files);
  const limited = await early.run("Local", { maxMatches: 1 });
  assert.equal(limited.matches.length, 1);
  assert.equal(limited.matchLimitReached, true);
  assert.ok(!early.reads.includes("src/file1.ts"));
  await assert.rejects(
    fixture(files).run("Local", {
      assertActive: () => {
        throw new Error("cancelled");
      },
    }),
    /cancelled/,
  );
});
