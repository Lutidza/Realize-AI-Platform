/**
 * @file .ai/tools/engineering/test/packageExports.test.ts
 * @version 1.0.1
 * @date 2026-10-30
 * @description Проверяет package owner patch, virtual targets, shadowing и host boundaries до native прогонов.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { EngineeringFailure } from "@realize/engineering-runtime";
import { collectArtifactReferences } from "../src/collectArtifactReferences.service.ts";
import { resolveNativeConfigArtifact } from "../src/resolveNativeConfigArtifact.service.ts";
import { test } from "node:test";
import { packageExportsData } from "./packageExportsMove.fixture.ts";
import { createSourceMoveResolver } from "../src/createSourceMoveResolver.service.ts";
import { rewritePackageExports } from "../src/rewritePackageExports.util.ts";
import { validateProjectMovePolicy } from "../src/validateProjectMovePolicy.validator.ts";
import type { SourceMoveResolverInput } from "../src/ProjectArtifactMove.types.ts";

function fixture(root = false, glob = true, directory = false) {
  const d = packageExportsData(root, glob),
    readPaths = new Set<string>();
  const input: SourceMoveResolverInput = {
    files: new Set([...d.files.keys()].filter((path) => path.endsWith(".ts"))),
    workspaceDirectories(path) {
      const directories = new Set<string>();
      for (const file of d.files.keys()) {
        if (!file.startsWith(path + "/")) continue;
        const child = file.slice(path.length + 1).split("/");
        if (child.length > 1) directories.add(path + "/" + child[0]);
      }
      return [...directories].sort();
    },
    from: directory ? d.sourceDirectory : d.from,
    to: directory ? d.targetDirectory : d.to,
    referenceRoots: d.referenceRoots,
    packageExportsWrite: d.movePolicy.packageExportsWrite,
    readPaths,
    readReference(path) {
      const text = d.files.get(path);
      if (text === undefined)
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return Buffer.from(text);
    },
  };
  return { ...d, input, resolve: () => createSourceMoveResolver(input) };
}
for (const [name, root, glob, directory] of [
  ["root/literal", true, false, false],
  ["subpaths/glob", false, true, false],
  ["directory", false, true, true],
] as const)
  test(`package exports ${name}: общий resolver сохраняет specifiers и unused exports`, () => {
    const f = fixture(root, glob, directory),
      r = f.resolve();
    assert.equal(r.configEdits.length, 1);
    assert.equal(r.configEdits[0].kind, "config.package-exports");
    assert.equal(
      r.resolveReference(f.consumers[0], f.consumers[0], "@fixture/math"),
      "@fixture/math",
    );
    const final = directory
      ? f.from.replace(f.sourceDirectory, f.targetDirectory)
      : f.to;
    assert.equal(
      r.resolveReference(f.from, final, "@fixture/shared"),
      "@fixture/shared",
    );
    assert.equal(
      r.resolveReference(f.from, final, "./detail/roundPrice.util"),
      directory
        ? "./detail/roundPrice.util"
        : "../domain/detail/roundPrice.util",
    );
    const expected = f.files
      .get(f.configOwner)!
      .replaceAll(
        directory ? "./src/domain" : "./src/domain/calculateTotal.util.js",
        directory
          ? "./src/pricing/domain"
          : "./src/pricing/calculateTotal.util.js",
      );
    assert.equal(
      Buffer.from(r.configEdits[0].content).toString("utf8"),
      expected,
    );
    for (const path of [
      "package.json",
      f.configOwner,
      "packages/app/package.json",
      "packages/shared/package.json",
      ...f.consumerConfigs,
    ])
      assert.ok(f.input.readPaths.has(path), path);
  });
test("package exports owner не принимается за затеняющий paths alias", () => {
  const f = fixture();
  f.files.set(
    "packages/math/tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        moduleResolution: "bundler",
        baseUrl: ".",
        paths: { "@fixture/math": ["src/domain/calculateTotal.util.ts"] },
      },
    }),
  );
  assert.throws(f.resolve);
});
test("package dependency вне source roots и перенос между packages блокируются", () => {
  const f = fixture();
  f.files.set(
    "packages/extra/package.json",
    '{"name":"@fixture/extra","exports":"./src/hidden.ts"}',
  );
  f.files.set("packages/extra/src/hidden.ts", "export {};");
  assert.throws(() =>
    f.resolve().resolveReference(f.from, f.to, "@fixture/extra"),
  );
  const g = fixture();
  g.input.to = "packages/app/src/calculateTotal.util.ts";
  assert.throws(g.resolve);
});
test("вне workspace roots или без native inventory package policy не работает", () => {
  const f = fixture();
  f.input.workspaceDirectories = undefined;
  assert.throws(f.resolve);
  const g = fixture();
  g.files.set("package.json", '{"workspaces":["outside"]}');
  g.files.set(
    "outside/package.json",
    '{"name":"@fixture/math","exports":"./src/value.ts"}',
  );
  assert.throws(g.resolve);
});
for (const exports of [
  { ".": { types: "./src/domain/calculateTotal.util.ts" } },
  { "./*": "./src/domain/*.js" },
  { ".": null },
  { ".": "./src/domain/calculateTotal.util" },
])
  test(`package owner отклоняет неподдержанные exports ${JSON.stringify(exports)}`, () => {
    const f = fixture();
    f.files.set(
      f.configOwner,
      JSON.stringify({ name: "@fixture/math", exports }),
    );
    assert.throws(f.resolve);
  });
test("JSON patch сохраняет BOM/CRLF/прочие bytes и проверяет исходный target", () => {
  const s =
    '\uFEFF{\r\n "name": "@fixture/math", "version": "1.2.3", "exports": "./src/value.js"\r\n}\r\n';
  assert.equal(
    rewritePackageExports(
      "package.json",
      s,
      new Map([
        [".", { previous: "./src/value.js", next: "./src/new/value.js" }],
      ]),
    ),
    s.replace("./src/value.js", "./src/new/value.js"),
  );
  assert.throws(() =>
    rewritePackageExports(
      "package.json",
      s,
      new Map([[".", { previous: "./wrong.js", next: "./new.js" }]]),
    ),
  );
  for (const bad of [
    '{"name":"a","name":"b","exports":"./a.ts"}',
    '{"name":"a","exports":{".":"./a.ts",".":"./b.ts"}}',
    '{"name":"a","exports":"./a.ts",}',
    '{/* comment */ "name":"a","exports":"./a.ts"}',
  ])
    assert.throws(() => rewritePackageExports("package.json", bad, new Map()));
});
test("packageWrite требует явных полномочий и не объединяет config owners", () => {
  const f = fixture();
  assert.deepEqual(validateProjectMovePolicy(f.movePolicy), f.movePolicy);
  for (const policy of [
    {
      ...f.movePolicy,
      tsconfigWrite: {
        path: "tsconfig.json",
        allConsumersInReferenceRoots: true,
      },
    },
    {
      ...f.movePolicy,
      packageExportsWrite: {
        ...f.movePolicy.packageExportsWrite,
        workspaceRoots: [],
      },
    },
    {
      ...f.movePolicy,
      packageExportsWrite: {
        ...f.movePolicy.packageExportsWrite,
        allConsumersInReferenceRoots: false,
      },
    },
    {
      ...f.movePolicy,
      packageExportsWrite: {
        ...f.movePolicy.packageExportsWrite,
        path: "package.json",
      },
    },
  ])
    assert.throws(() => validateProjectMovePolicy(policy as never));
});

test("native config profile не выдаёт authored допуск generated policy", () => {
  const f = fixture();
  assert.throws(() =>
    resolveNativeConfigArtifact(
      f.configOwner,
      Buffer.from(f.files.get(f.configOwner)!),
      () => Buffer.from("evidence"),
      [
        {
          id: "manifest",
          version: "1",
          root: f.configOwner,
          ownerRef: "math",
          purpose: "Generated config",
          boundary: "generated",
          allowedKinds: ["config.package-exports"],
          allowedProvenance: ["generated"],
          sourcePaths: ["policy.ts"],
        },
      ],
      "config.package-exports",
    ),
  );
});

test("package provenance проверяется снова, если paths fallback начинает затенять export после move", () => {
  const f = fixture();
  f.files.set(
    "packages/math/tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        moduleResolution: "bundler",
        baseUrl: "src",
        paths: { "@fixture/math": ["pricing/calculateTotal.util.ts"] },
      },
    }),
  );
  assert.throws(f.resolve);
});

test("nested manifest не позволяет пересечь package boundary под тем же physical prefix", () => {
  const f = fixture();
  f.input.to = "packages/math/child/src/calculateTotal.util.ts";
  f.files.set("packages/math/child/package.json", '{"name":"@fixture/nested"}');
  assert.throws(f.resolve);
});
test("reference reader сохраняет structured host failures и скрывает raw errors", () => {
  for (const code of ["FORBIDDEN", "CONFLICT", "LIMIT_EXCEEDED"] as const) {
    const failure = new EngineeringFailure(
      code,
      "trusted rejection",
      "planning",
    );
    assert.throws(
      () =>
        collectArtifactReferences(() => {
          throw failure;
        }).require("package.json"),
      (error) => error === failure,
    );
  }
  assert.throws(
    () =>
      collectArtifactReferences(() => {
        throw new Error("private detail");
      }).require("package.json"),
    {
      code: "UNSUPPORTED",
      message: "Не подтверждён обязательный reference артефакта.",
    },
  );
});
