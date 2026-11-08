/**
 * @file .ai/tools/engineering/test/wildcardPathsMove.test.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Проверяет wildcard directory config effect на native FS: preview, compiler, ACL, snapshot и SIGKILL.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import ts from "typescript";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { wildcardPathsMoveFixture } from "./wildcardPathsMove.fixture.ts";
import {
  applyCommand,
  getCommand,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(
    join(homedir(), ".cache", "engineering-wildcard-native-"),
  );
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
type Fixture = ReturnType<typeof wildcardPathsMoveFixture>;
function fixture(t: TestContext, shared = true, inherited = true) {
  const f = wildcardPathsMoveFixture(native, undefined, shared, inherited);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
const read = (f: Fixture, path: string) =>
  readFileSync(join(f.checkout, path), "utf8");
const mapped = (f: Fixture, path: string) =>
  path.replace(f.sourceDirectory, f.targetDirectory);
const command = (f: Fixture) =>
  planCommand([
    {
      kind: "move",
      from: f.sourceDirectory,
      to: f.targetDirectory,
      expectedVersion: f.ports.directoryVersion(f.sourceDirectory),
    },
  ]);
function patchConfig(
  f: Fixture,
  update: (paths: Record<string, string[]>) => void,
) {
  const parsed = ts.parseConfigFileTextToJson(
    f.configOwner,
    read(f, f.configOwner),
  ).config;
  update(parsed.compilerOptions.paths);
  f.put(f.configOwner, JSON.stringify(parsed));
}
async function assertReceipt(
  f: Fixture,
  done: Awaited<ReturnType<Fixture["runtime"]["apply"]>>,
) {
  const receipt = await f.runtime.receipt(getCommand(done));
  assert.deepEqual(
    receipt!.changedArtifacts!.map((item) => item.path).sort(),
    [
      f.targetDirectory,
      f.targetDirectory + "/detail",
      ...f.members.map((path) => mapped(f, path)),
      f.relativeConsumer,
      f.broadConsumer,
      f.configOwner,
    ].sort(),
  );
  for (const item of receipt!.changedArtifacts!)
    if (item.sha256 !== null)
      assert.equal(
        item.sha256,
        sha256Bytes(readFileSync(join(f.checkout, item.path))),
      );
}

for (const [name, shared, inherited] of [
  ["own", false, false],
  ["inherited", false, true],
  ["shared + explicit projects", true, true],
] as const)
  test(`wildcard directory ${name}: aliases, nested roots, JSONC, receipt, retry и compiler`, async (t) => {
    const f = fixture(t, shared, inherited);
    const readonly = [...f.readonlyConfigs, ...f.aliasConsumers];
    const originals = readonly.map((path) => [path, read(f, path)] as const),
      config = read(f, f.configOwner);
    f.control.deniedPaths = readonly;
    const plan = await f.runtime.plan(command(f));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const preview = await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.equal(f.control.writes, 0);
    assert.equal(preview.effects.length, 7);
    assert.equal(
      preview.effects.filter((e) => e.paths.includes(f.configOwner)).length,
      1,
    );
    const apply = applyCommand(plan),
      done = await f.runtime.apply(apply);
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(
      read(f, f.configOwner),
      config.replaceAll(f.sourceDirectory, f.targetDirectory),
    );
    for (const [path, original] of originals)
      assert.equal(read(f, path), original);
    assert.match(read(f, mapped(f, f.from)), /from "@nested\/roundPrice.util"/);
    assert.ok(
      read(f, f.broadConsumer).includes(
        "@app/" + f.targetDirectory.slice(4) + "/calculateTotal.util",
      ),
    );
    assert.equal(existsSync(join(f.checkout, f.sourceDirectory)), false);
    await assertReceipt(f, done);
    assert.equal((await f.runtime.apply(apply)).operationId, done.operationId);
    assert.equal(f.control.writes, 7);
    for (const configPath of f.consumerConfigs)
      execFileSync(
        process.execPath,
        [
          resolve("node_modules/typescript/bin/tsc"),
          "--project",
          join(f.checkout, configPath),
          "--noEmit",
          "--target",
          "ES2018",
          "--module",
          "ESNext",
          "--skipLibCheck",
          "--ignoreDeprecations",
          "6.0",
        ],
        { encoding: "utf8", timeout: 60_000 },
      );
  });

for (const variant of [
  "fallback",
  "target suffix",
  "alias suffix",
  "empty nested root",
  "unknown member",
  "collision",
])
  test(`wildcard plan rejects ${variant} before writes`, async (t) => {
    const f = fixture(t);
    if (variant === "unknown member")
      f.put(f.sourceDirectory + "/foreign.ts", "export {};");
    else if (variant === "collision")
      f.utility(
        f.targetDirectory + "/existing.util.ts",
        "export function existing() { return 1; }",
      );
    else
      patchConfig(f, (paths) => {
        if (variant === "fallback") paths["@unused/*"].push("src/fallback/*");
        if (variant === "target suffix")
          paths["@unused/*"] = [f.sourceDirectory + "/*.js"];
        if (variant === "alias suffix")
          paths["@bad/*.js"] = [f.sourceDirectory + "/*"];
        if (variant === "empty nested root")
          paths["@unused/*"] = [f.sourceDirectory + "/empty/*"];
      });
    const plan = await f.runtime.plan(command(f));
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(f.control.writes, 0);
  });

for (const variant of [
  "owner write",
  "owner read",
  "unused member read",
  "project read",
  "unchanged consumer read",
  "changed consumer write",
])
  test(`wildcard ACL ${variant} before plan and after preview`, async (t) => {
    const f = fixture(t),
      key = variant.endsWith("read") ? "deniedReadPaths" : "deniedPaths";
    const path = variant.startsWith("owner")
      ? f.configOwner
      : variant.startsWith("unused")
        ? f.members[2]
        : variant.startsWith("project")
          ? "config/test.json"
          : variant.startsWith("unchanged")
            ? f.consumer
            : f.broadConsumer;
    f.control[key] = [path];
    assert.equal((await f.runtime.plan(command(f))).error?.code, "FORBIDDEN");
    f.control[key] = [];
    const plan = await f.runtime.plan(command(f));
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
  "config",
  "unused member",
  "new member",
  "project",
  "policy",
])
  test(`wildcard snapshot detects ${variant} drift`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(command(f));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    if (variant === "new member")
      f.utility(
        f.sourceDirectory + "/late.util.ts",
        "export function late() { return 1; }",
      );
    else {
      const path =
        variant === "config"
          ? f.configOwner
          : variant === "unused member"
            ? f.members[2]
            : variant === "project"
              ? "config/test.json"
              : policySource;
      f.put(path, read(f, path) + "\n// drift\n");
    }
    await assert.rejects(f.runtime.apply(applyCommand(plan)), {
      code: "CONFLICT",
    });
    assert.equal(f.control.writes, 0);
  });

test("wildcard recovery проверяет ACL explicit project после directory rename", async (t) => {
  const f = fixture(t),
    plan = await f.runtime.plan(command(f));
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  f.control.afterWrite = () => {
    f.control.deniedReadPaths = ["config/test.json"];
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
  assert.equal(f.control.writes, 7);
  await assertReceipt(f, done);
});

for (const atWrite of [1, 6, 7])
  test(`wildcard SIGKILL after effect ${atWrite}: полный receipt после resume`, async (t) => {
    let f = fixture(t);
    const plan = await f.runtime.plan(command(f));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const input = join(f.root, "crash.json"),
      root = f.root;
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
    child.stderr.on("data", (value) => {
      stderr += value;
    });
    const [code, signal] = await once(child, "exit");
    assert.equal(code, null, stderr);
    assert.equal(signal, "SIGKILL", stderr);
    f = wildcardPathsMoveFixture(native, root);
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
    assert.equal(f.control.writes, 7 - atWrite);
    await assertReceipt(f, done);
  });
