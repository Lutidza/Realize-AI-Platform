/**
 * @file .ai/tools/engineering/test/workspaceCatalogMove.test.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Проверяет shallow workspace catalog на native FS с большим sibling, ACL и отрицательными probes.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { packageExportsMoveFixture } from "./packageExportsMove.fixture.ts";
import { applyCommand, getCommand } from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(join(homedir(), ".cache", "engineering-catalog-native-"));
  native = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/buildEngineeringNative.mjs", "--output", build],
      { encoding: "utf8", timeout: 60_000 },
    ),
  );
});
after(() => {
  if (build) rmSync(build, { recursive: true, force: true });
});
function fixture(t: TestContext, glob = true) {
  const f = packageExportsMoveFixture(native, undefined, false, glob);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
for (const [directory, glob] of [
  [false, true],
  [true, true],
  [false, false],
] as const)
  test(`catalog ${directory ? "tree" : "file"}/${glob ? "glob" : "literal"}: 2000 unrelated sources не входят в обход`, async (t) => {
    const f = fixture(t, glob);
    f.put(
      "packages/unrelated/package.json",
      '{"name":"@fixture/unrelated","exports":"./src/unused.ts"}',
    );
    if (!glob)
      f.put(
        "package.json",
        '{"workspaces":["packages/math","packages/app","packages/shared","packages/unrelated"]}',
      );
    for (let i = 0; i < 2000; i++)
      f.put(
        `packages/unrelated/src/group${i % 160}/file${i}.ts`,
        "export {};\n",
      );
    f.control.deniedReadPaths = ["packages/unrelated/src"];
    const plan = await f.runtime.plan(f.command(directory));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const preview = await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.equal(f.control.writes, 0);
    assert.equal(preview.effects.length, directory ? 5 : 3);
    // Несвязанный source content не является версией каталога и не расширяет effect.
    f.put(
      "packages/unrelated/src/group0/file0.ts",
      "export const unrelated = 1;\n",
    );
    const command = applyCommand(plan),
      done = await f.runtime.apply(command);
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(f.control.writes, directory ? 5 : 3);
    const receipt = await f.runtime.receipt(getCommand(done));
    assert.equal(receipt!.changedArtifacts!.length, directory ? 6 : 2);
    for (const artifact of receipt!.changedArtifacts!)
      if (artifact.sha256 !== null)
        assert.equal(
          artifact.sha256,
          sha256Bytes(readFileSync(join(f.checkout, artifact.path))),
        );
    assert.equal(
      (await f.runtime.apply(command)).operationId,
      done.operationId,
    );
    assert.equal(f.control.writes, directory ? 5 : 3);
    assert.ok(
      f.control.referenceReads.includes("packages/unrelated/package.json"),
    );
    assert.equal(
      f.control.referenceReads.filter((p) =>
        p.startsWith("packages/unrelated/src"),
      ).length,
      0,
    );
    assert.equal(
      f.control.readAccessChecks.filter((p) =>
        p.startsWith("packages/unrelated/src"),
      ).length,
      0,
    );
  });

for (const variant of ["missing glob", "empty package", "nested boundary"])
  test(`catalog negative probe ${variant}: новое содержимое блокирует apply`, async (t) => {
    const f = fixture(t);
    if (variant === "missing glob")
      f.put(
        "package.json",
        '{"workspaces":["packages/missing/*","packages/*"]}',
      );
    if (variant === "empty package")
      mkdirSync(join(f.checkout, "packages/empty"));
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const path =
      variant === "missing glob"
        ? "packages/missing/new/package.json"
        : variant === "empty package"
          ? "packages/empty/package.json"
          : "packages/math/src/pricing/package.json";
    f.put(path, '{"name":"@fixture/late"}');
    await assert.rejects(f.runtime.apply(applyCommand(plan)), {
      code: "CONFLICT",
    });
    assert.equal(f.control.writes, 0);
  });
for (const path of [
  "packages/unrelated",
  "packages/unrelated/package.json",
  "packages/math/src/pricing/package.json",
])
  test(`catalog ACL ${path}: отказ до подготовки и после preview`, async (t) => {
    const f = fixture(t);
    f.put("packages/unrelated/package.json", '{"name":"@fixture/unrelated"}');
    f.control.deniedReadPaths = [path];
    assert.equal((await f.runtime.plan(f.command())).error?.code, "FORBIDDEN");
    f.control.deniedReadPaths = [];
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    f.control.deniedReadPaths = [path];
    await assert.rejects(f.runtime.apply(applyCommand(plan)), {
      code: "FORBIDDEN",
    });
    assert.equal(f.control.writes, 0);
  });
test("catalog больше 256 entries отклоняется до чтения manifests", async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 254; i++)
    mkdirSync(join(f.checkout, "packages", `empty${i}`));
  const plan = await f.runtime.plan(f.command());
  assert.equal(plan.error?.code, "LIMIT_EXCEEDED", JSON.stringify(plan));
  assert.equal(f.control.writes, 0);
  assert.equal(
    f.control.referenceReads.filter((p) => p.startsWith("packages/empty"))
      .length,
    0,
  );
});
test("source inventory больше 128 файлов по-прежнему отклоняется", async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 129; i++)
    f.put(`packages/app/src/extra${i}.ts`, "export {};\n");
  const plan = await f.runtime.plan(f.command());
  assert.equal(plan.error?.code, "LIMIT_EXCEEDED", JSON.stringify(plan));
  assert.equal(f.control.writes, 0);
});
test("catalog не проходит через symlink workspace member", async (t) => {
  const f = fixture(t);
  symlinkSync(
    join(f.checkout, "packages/math"),
    join(f.checkout, "packages/linked"),
    "dir",
  );
  const plan = await f.runtime.plan(f.command());
  assert.equal(plan.error?.code, "UNSUPPORTED", JSON.stringify(plan));
  assert.equal(f.control.writes, 0);
});
