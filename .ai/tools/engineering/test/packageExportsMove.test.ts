/**
 * @file .ai/tools/engineering/test/packageExportsMove.test.ts
 * @version 1.0.1
 * @date 2026-10-30
 * @description Проверяет workspace exports move на native FS: compiler, ACL, catalog drift, receipt и SIGKILL recovery.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { packageExportsMoveFixture } from "./packageExportsMove.fixture.ts";
import {
  applyCommand,
  getCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(join(homedir(), ".cache", "engineering-package-native-"));
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
type Fixture = ReturnType<typeof packageExportsMoveFixture>;
function fixture(t: TestContext, root = false, glob = true) {
  const f = packageExportsMoveFixture(native, undefined, root, glob);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
const read = (f: Fixture, path: string) =>
  readFileSync(join(f.checkout, path), "utf8");
const mapped = (f: Fixture, path: string, directory: boolean) =>
  directory
    ? path.replace(f.sourceDirectory, f.targetDirectory)
    : path === f.from
      ? f.to
      : path;
async function assertReceipt(
  f: Fixture,
  done: Awaited<ReturnType<Fixture["runtime"]["apply"]>>,
  directory: boolean,
) {
  const receipt = await f.runtime.receipt(getCommand(done));
  assert.deepEqual(
    receipt!.changedArtifacts!.map((a) => a.path).sort(),
    [
      f.configOwner,
      ...(directory
        ? [
            f.targetDirectory,
            f.targetDirectory + "/detail",
            ...f.members.map((p) => mapped(f, p, true)),
          ]
        : [f.to]),
    ].sort(),
  );
  for (const item of receipt!.changedArtifacts!)
    if (item.sha256 !== null)
      assert.equal(
        item.sha256,
        sha256Bytes(readFileSync(join(f.checkout, item.path))),
      );
}
for (const [name, root, glob, directory] of [
  ["root/literal", true, false, false],
  ["subpaths/glob", false, true, false],
  ["directory/glob", false, true, true],
] as const)
  test(`package exports ${name}: preview, неизменные consumers, receipt, retry и compiler`, async (t) => {
    const f = fixture(t, root, glob),
      readonly = [
        ...f.consumers,
        ...f.consumerConfigs,
        "package.json",
        "packages/app/package.json",
        "packages/shared/package.json",
      ],
      originals = readonly.map((p) => [p, read(f, p)] as const),
      original = read(f, f.configOwner),
      expected = directory ? 5 : 3;
    f.control.deniedPaths = readonly;
    const plan = await f.runtime.plan(f.command(directory));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const preview = await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.equal(f.control.writes, 0);
    assert.equal(preview.effects.length, expected);
    assert.equal(
      preview.effects.filter((e) => e.paths.includes(f.configOwner)).length,
      1,
    );
    const command = applyCommand(plan),
      done = await f.runtime.apply(command);
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(f.control.writes, expected);
    assert.equal(
      read(f, f.configOwner),
      original.replaceAll(
        directory ? "./src/domain" : "./src/domain/calculateTotal.util.js",
        directory
          ? "./src/pricing/domain"
          : "./src/pricing/calculateTotal.util.js",
      ),
    );
    for (const [path, text] of originals)
      assert.equal(read(f, path), text, path);
    assert.equal(
      existsSync(join(f.checkout, directory ? f.sourceDirectory : f.from)),
      false,
    );
    assert.ok(
      read(f, mapped(f, f.from, directory)).includes('from "@fixture/shared"'),
    );
    await assertReceipt(f, done, directory);
    assert.equal(
      (await f.runtime.apply(command)).operationId,
      done.operationId,
    );
    assert.equal(f.control.writes, expected);
    for (const config of f.consumerConfigs)
      execFileSync(
        process.execPath,
        [
          resolve("node_modules/typescript/bin/tsc"),
          "--project",
          join(f.checkout, config),
          "--skipLibCheck",
          "--ignoreDeprecations",
          "6.0",
        ],
        { encoding: "utf8", timeout: 60_000 },
      );
  });

for (const variant of [
  "conditional unused export",
  "duplicate package",
  "ambiguous source",
  "dependency outside source roots",
  "collision",
  "owner missing catalog",
  "nested package boundary",
])
  test(`package exports plan rejects ${variant} before writes`, async (t) => {
    const f = fixture(t);
    if (variant === "conditional unused export") {
      const p = JSON.parse(read(f, f.configOwner).replace(/^\uFEFF/u, ""));
      p.exports["./unused"] = { types: p.exports["./unused"] };
      f.put(f.configOwner, JSON.stringify(p));
    }
    if (variant === "duplicate package")
      f.put(
        "packages/duplicate/package.json",
        '{"name":"@fixture/math","exports":"./src/missing.ts"}',
      );
    if (variant === "ambiguous source")
      f.put(
        f.from.replace(".ts", ".js"),
        "export function calculateTotal() { return 0; }",
      );
    if (variant === "dependency outside source roots") {
      f.put(
        "packages/extra/src/hidden.ts",
        "export function sharedValue() { return 1; }",
      );
      f.put(
        "packages/extra/package.json",
        '{"name":"@fixture/extra","exports":"./src/hidden.ts"}',
      );
      f.put(
        f.from,
        read(f, f.from).replace("@fixture/shared", "@fixture/extra"),
      );
    }
    if (variant === "collision") f.put(f.to, read(f, f.from));
    if (variant === "owner missing catalog")
      f.put(
        "package.json",
        '{"workspaces":["packages/app","packages/shared"]}',
      );
    if (variant === "nested package boundary")
      f.put(
        "packages/math/src/pricing/package.json",
        '{"name":"@fixture/nested"}',
      );
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(f.control.writes, 0);
  });

for (const [name, path, write] of [
  ["owner write", "packages/math/package.json", true],
  ["owner read", "packages/math/package.json", false],
  ["catalog read", "package.json", false],
  ["workspace namespace read", "packages", false],
  ["peer manifest read", "packages/shared/package.json", false],
  ["consumer read", "packages/app/src/useTotal.util.ts", false],
  ["source write", "packages/math/src/domain/calculateTotal.util.ts", true],
] as const)
  test(`package exports ACL ${name} before plan and after preview`, async (t) => {
    const f = fixture(t),
      key = write ? "deniedPaths" : "deniedReadPaths";
    f.control[key] = [path];
    assert.equal((await f.runtime.plan(f.command())).error?.code, "FORBIDDEN");
    f.control[key] = [];
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    f.control[key] = [path];
    try {
      const done = await f.runtime.apply(applyCommand(plan));
      assert.equal(done.error?.code, "FORBIDDEN", JSON.stringify(done));
    } catch (error) {
      assert.equal((error as { code: string }).code, "FORBIDDEN");
    }
    assert.equal(f.control.writes, 0);
  });

for (const variant of [
  "source",
  "owner",
  "root manifest",
  "peer manifest",
  "new package",
  "empty directory",
  "policy",
])
  test(`package exports snapshot detects ${variant} drift`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    if (variant === "new package")
      f.put("packages/late/package.json", '{"name":"@fixture/late"}');
    else if (variant === "empty directory")
      mkdirSync(join(f.checkout, "packages/empty"));
    else {
      const path =
        variant === "source"
          ? f.from
          : variant === "owner"
            ? f.configOwner
            : variant === "root manifest"
              ? "package.json"
              : variant === "peer manifest"
                ? "packages/shared/package.json"
                : policySource;
      f.put(path, read(f, path) + "\n");
    }
    await assert.rejects(f.runtime.apply(applyCommand(plan)), {
      code: "CONFLICT",
    });
    assert.equal(f.control.writes, 0);
  });

test("package exports recovery проверяет peer manifest ACL после rename", async (t) => {
  const f = fixture(t),
    plan = await f.runtime.plan(f.command(true));
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  f.control.afterWrite = () => {
    f.control.deniedReadPaths = ["packages/shared/package.json"];
  };
  const partial = await f.runtime.apply(applyCommand(plan));
  assert.equal(partial.state, "recovery_required", JSON.stringify(partial));
  assert.equal(f.control.writes, 1);
  await assert.rejects(f.runtime.inspectRecovery(getCommand(partial)), {
    code: "FORBIDDEN",
  });
  f.control.afterWrite = undefined;
  f.control.deniedReadPaths = [];
  const recovery = await f.runtime.inspectRecovery(getCommand(partial));
  const done = await f.runtime.recover({
    ...getCommand(partial),
    recoveryPlanId: recovery.recoveryPlanId,
    recoveryPlanHash: recovery.recoveryPlanHash,
    expectedRevision: recovery.revision,
    requestId: randomUUID(),
    action: "resume",
  });
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.equal(f.control.writes, 5);
  await assertReceipt(f, done, true);
});

for (const [directory, atWrite] of [
  [false, 1],
  [false, 2],
  [false, 3],
  [true, 1],
  [true, 4],
  [true, 5],
] as const)
  test(`package exports SIGKILL ${directory ? "directory" : "file"} after effect ${atWrite}: frozen resume`, async (t) => {
    let f = fixture(t);
    const plan = await f.runtime.plan(f.command(directory));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const root = f.root,
      input = join(root, "crash.json");
    writeFileSync(
      input,
      JSON.stringify({
        native,
        root,
        movePolicy: f.movePolicy,
        extraFolderPolicies: f.extraFolderPolicies,
        command: applyCommand(plan),
        atWrite,
      }),
    );
    f.close();
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        ".ai/tools/engineering/test/filesystemCrash.worker.ts",
        input,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (v) => {
      stderr += v;
    });
    const [code, signal] = await once(child, "exit");
    assert.equal(code, null, stderr);
    assert.equal(signal, "SIGKILL", stderr);
    f = packageExportsMoveFixture(native, root);
    t.after(() => f.close());
    const recovery = await f.runtime.inspectRecovery(getCommand(plan));
    assert.deepEqual(recovery.actions, ["resume"]);
    const done = await f.runtime.recover({
      ...getCommand(plan),
      recoveryPlanId: recovery.recoveryPlanId,
      recoveryPlanHash: recovery.recoveryPlanHash,
      expectedRevision: recovery.revision,
      requestId: randomUUID(),
      action: "resume",
    });
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(f.control.writes, (directory ? 5 : 3) - atWrite);
    await assertReceipt(f, done, directory);
  });
