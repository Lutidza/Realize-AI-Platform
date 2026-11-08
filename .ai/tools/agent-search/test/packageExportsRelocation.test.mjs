/**
 * @file .ai/tools/agent-search/test/packageExportsRelocation.test.mjs
 * @version 1.1.0
 * @date 2026-11-02
 * @description Проверяет opt-in package exports resolution, provenance, cache и сохранение navigation policy.
 * @see documentation/architecture/repository-search.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createImportReadContextSync } from "../src/createImportReadContext.service.mjs";
import { resolveModulePathSync } from "../src/resolveModulePath.service.mjs";
import { readPackageExports } from "../src/readPackageExports.util.mjs";
const from = "packages/app/src/use.ts",
  target = "packages/math/src/value.ts";
function fixture(exports = "./src/value.js", extra = {}, denied = []) {
  const files = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: { moduleResolution: "bundler" },
    }),
    "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
    "packages/math/package.json": JSON.stringify({
      name: "@fixture/math",
      exports,
    }),
    [target]: "export const value=1;",
    ...extra,
  };
  const reads = new Map(),
    context = createImportReadContextSync({
      isAllowed: (path) => !denied.includes(path),
      read(path, { onReadBytes }) {
        reads.set(path, (reads.get(path) ?? 0) + 1);
        if (!(path in files)) return { status: "not_found" };
        onReadBytes(Buffer.byteLength(files[path]));
        return { status: "ok", text: files[path] };
      },
      listDirectories: (path) =>
        path === "packages"
          ? { status: "ok", directories: ["packages/math", "packages/app"] }
          : { status: "forbidden" },
    });
  return {
    context,
    reads,
    resolve: (
      specifier = "@fixture/math",
      policy = "relocation-exports",
      mode = "import",
    ) => resolveModulePathSync(context, from, specifier, mode, policy),
  };
}
test("package mode сохраняет root/subpath, provenance и общий cache; прежняя relocation отклоняет bare", () => {
  const f = fixture({ ".": "./src/value.js", "./total": "./src/value.ts" });
  assert.equal(
    f.resolve(undefined, "relocation").reason,
    "unsupported_specifier",
  );
  for (const specifier of ["@fixture/math", "@fixture/math/total"]) {
    const resolved = f.resolve(specifier);
    assert.equal(resolved.path, target);
    assert.equal(
      resolved.packageExport.manifestPath,
      "packages/math/package.json",
    );
    assert.equal(f.resolve(specifier).path, target);
  }
  assert.ok([...f.reads.values()].every((n) => n === 1));
  assert.ok(f.context.footprint.has("directory:packages"));
  assert.equal(f.resolve("@fixture/math/missing").reason, "not_found");
});
for (const [name, value] of [
  ["conditions", { import: "./src/value.js", default: "./src/value.js" }],
  ["wildcard", { "./*": "./src/*.js" }],
  ["array", ["./src/value.js"]],
  ["null", { ".": null }],
  ["extensionless", "./src/value"],
  ["escape", "../src/value.js"],
  ["encoded", "./src/%76alue.js"],
  ["noncanonical", "./src/./value.js"],
  ["empty", {}],
])
  test(`relocation-exports import/require отклоняют ${name}`, () => {
    for (const mode of ["import", "require"])
      assert.equal(
        fixture(value).resolve(undefined, "relocation-exports", mode).reason,
        "unsupported_configuration",
      );
  });
test("извлечение selector сохраняет navigation conditional exports", () => {
  const f = fixture({ types: "./src/value.js", default: "./missing.js" });
  assert.equal(f.resolve(undefined, "navigation").path, target);
});
test("legacy/no-exports/unknown mode не становятся разрешёнными mutation forms", () => {
  assert.equal(
    fixture(undefined, {
      "packages/math/package.json":
        '{"name":"@fixture/math","main":"./src/value.js"}',
    }).resolve().reason,
    "unsupported_configuration",
  );
  assert.equal(
    fixture(undefined, {
      "tsconfig.json": '{"compilerOptions":{"moduleResolution":"node10"}}',
    }).resolve().reason,
    "unsupported_configuration",
  );
  assert.equal(
    fixture().resolve(undefined, "relocation-exports", "unknown").reason,
    "unsupported_configuration",
  );
});
for (const extension of ["cjs", "cts"])
  for (const rootExport of [false, true])
    test(`${extension} exact ${rootExport ? "root" : "subpaths"}: import/require target, provenance и cache совпадают`, () => {
      const path = `packages/math/src/value.${extension}`;
      const exports = rootExport
        ? "./src/value.cjs"
        : { ".": "./src/value.cjs", "./total": "./src/value.cjs" };
      const f = fixture(exports, { [path]: "function value(){return 1;}" });
      for (const specifier of rootExport
        ? ["@fixture/math"]
        : ["@fixture/math", "@fixture/math/total"])
        for (const mode of ["require", "import", "require"]) {
          const resolved = f.resolve(specifier, "relocation-exports", mode);
          assert.equal(resolved.path, path);
          assert.deepEqual(resolved.packageExport, {
            manifestPath: "packages/math/package.json",
            subpath: specifier.endsWith("/total") ? "./total" : ".",
            target: "./src/value.cjs",
          });
        }
      assert.ok([...f.reads.values()].every((n) => n === 1));
      assert.equal(
        f.resolve(undefined, "relocation", "require").reason,
        "unsupported_specifier",
      );
    });
test("require exports сохраняет source ACL и ambiguity companions", () => {
  const path = "packages/math/src/value.cts";
  assert.equal(
    fixture("./src/value.cjs", { [path]: "" }, [path]).resolve(
      undefined,
      "relocation-exports",
      "require",
    ).reason,
    "forbidden",
  );
  assert.equal(
    fixture("./src/value.cjs", {
      [path]: "",
      "packages/math/src/value.cjs": "",
    }).resolve(undefined, "relocation-exports", "require").reason,
    "ambiguous",
  );
  assert.equal(
    fixture(undefined, {
      "tsconfig.json": '{"compilerOptions":{"moduleResolution":"node10"}}',
    }).resolve(undefined, "relocation-exports", "require").reason,
    "unsupported_configuration",
  );
});
test("package source ambiguity и duplicate workspace name блокируют relocation", () => {
  assert.equal(
    fixture(undefined, {
      [target.replace(".ts", ".js")]: "export {};",
    }).resolve().reason,
    "ambiguous",
  );
  assert.equal(
    fixture(undefined, {
      "packages/app/package.json": '{"name":"@fixture/math"}',
    }).resolve().reason,
    "ambiguous",
  );
});
test("baseUrl shadowing или отказ его чтения не скрывается package fallback", () => {
  const config =
    '{"compilerOptions":{"moduleResolution":"bundler","baseUrl":"."}}';
  assert.equal(
    fixture(undefined, {
      "tsconfig.json": config,
      "@fixture/math.ts": "export {};",
    }).resolve().reason,
    "unsupported_configuration",
  );
  assert.equal(
    fixture(undefined, { "tsconfig.json": config }, [
      "@fixture/math.ts",
    ]).resolve().reason,
    "forbidden",
  );
  assert.equal(
    fixture(undefined, { "tsconfig.json": config }).resolve().path,
    target,
  );
});
test("paths shadow не получает ложное package provenance", () => {
  const f = fixture(undefined, {
    "tsconfig.json":
      '{"compilerOptions":{"moduleResolution":"bundler","baseUrl":".","paths":{"@fixture/math":["packages/math/src/value.ts"]}}}',
  });
  assert.equal(f.resolve().path, target);
  assert.equal(f.resolve().packageExport, undefined);
});
test("отказ manifest read и exports budget сохраняются явными", () => {
  assert.equal(
    fixture(undefined, {}, ["packages/math/package.json"]).resolve().reason,
    "forbidden",
  );
  assert.equal(
    readPackageExports(
      Object.fromEntries(
        Array.from({ length: 2049 }, (_, i) => [
          `./entry${i}`,
          "./src/value.ts",
        ]),
      ),
    ).reason,
    "scan_budget",
  );
});
