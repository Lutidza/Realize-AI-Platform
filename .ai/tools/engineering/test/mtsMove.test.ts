/**
 * @file .ai/tools/engineering/test/mtsMove.test.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Проверяет MTS native moves с реальным emit/Node, aliases/exports и SIGKILL recovery.
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
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import {
  esmMoveFixture,
  esmPackageMoveFixture,
  checkEsmTypes,
  runMtsOracle,
} from "./esmMove.fixture.ts";
import { applyCommand, getCommand } from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(join(homedir(), ".cache", "engineering-mts-native-"));
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
function fixture(t: TestContext, sourceRoot = "src") {
  const f = esmMoveFixture(native, undefined, sourceRoot, "mts");
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
type Fixture = ReturnType<typeof fixture>;
const read = (f: Fixture, path: string) =>
  readFileSync(join(f.checkout, path), "utf8");
async function receipt(
  f: Fixture,
  done: Awaited<ReturnType<Fixture["runtime"]["apply"]>>,
  paths: string[],
) {
  const r = await f.runtime.receipt(getCommand(done));
  assert.deepEqual(
    r!.changedArtifacts!.map((x) => x.path).sort(),
    paths.sort(),
  );
  for (const a of r!.changedArtifacts!)
    if (a.sha256 !== null)
      assert.equal(
        a.sha256,
        sha256Bytes(readFileSync(join(f.checkout, a.path))),
      );
}
for (const [name, consumers] of [
  ["calculateTotal.util.mts", ["src/useTotal.service.mts"]],
  [
    "readPrice.service.mts",
    ["src/feature/calculateTotal.util.mts", "src/useTotal.service.mts"],
  ],
  ["requestPrice.adapter.mts", ["src/feature/readPrice.service.mts"]],
  ["Price.adapter.mts", ["src/feature/requestPrice.adapter.mts"]],
] as const)
  test(`MTS ${name}: emit/Node до/после, preview, receipt и retry`, async (t) => {
    const f = fixture(t),
      from = "src/feature/" + name,
      to = "src/moved/" + name;
    f.put(
      f.consumer,
      read(f, f.consumer).replace(
        "useTotal(): number",
        'useTotal(): ReturnType<typeof import("./feature/calculateTotal.util.mjs")["calculateTotal"]>',
      ),
    );
    runMtsOracle(f.checkout, f.consumer);
    const original = read(f, from),
      config = read(f, "tsconfig.json");
    f.control.deniedPaths = ["tsconfig.json", "package.json"];
    const plan = await f.runtime.plan(f.command(false, from));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const preview = await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.equal(f.control.writes, 0);
    assert.equal(read(f, from), original);
    assert.equal(preview.effects.length, consumers.length + 2);
    const command = applyCommand(plan),
      done = await f.runtime.apply(command);
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(existsSync(join(f.checkout, from)), false);
    assert.equal(read(f, "tsconfig.json"), config);
    assert.ok(read(f, to).includes("@file " + to));
    await receipt(f, done, [to, ...consumers]);
    runMtsOracle(f.checkout, f.consumer);
    assert.equal(
      (await f.runtime.apply(command)).operationId,
      done.operationId,
    );
    assert.equal(f.control.writes, consumers.length + 2);
  });
for (const sourceRoot of ["src", ".ai/tools/example"])
  test(`MTS directory ${sourceRoot}: BOM/CRLF и compiled ESM`, async (t) => {
    const f = fixture(t, sourceRoot);
    f.put(f.from, "\uFEFF" + read(f, f.from).replaceAll("\n", "\r\n"));
    runMtsOracle(f.checkout, f.consumer);
    const plan = await f.runtime.plan(f.command(true));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    assert.equal(f.control.writes, 0);
    const done = await f.runtime.apply(applyCommand(plan));
    assert.equal(done.state, "completed", JSON.stringify(done));
    const moved = f.from.replace(f.directory, f.destination);
    assert.equal(read(f, moved).charCodeAt(0), 0xfeff);
    assert.equal(read(f, moved).replaceAll("\r\n", "").includes("\n"), false);
    assert.ok(
      read(f, f.destination + "/Price.adapter.mts").includes(
        '"../../shared/basePrice.util.mjs"',
      ),
    );
    await receipt(f, done, [
      f.destination,
      ...f.members.map((p) => p.replace(f.directory, f.destination)),
      f.consumer,
    ]);
    assert.equal(f.control.writes, 6);
    runMtsOracle(f.checkout, f.consumer);
  });
test("MTS alias сохраняет .mjs compiler mapping", async (t) => {
  const f = fixture(t),
    config = JSON.parse(read(f, "tsconfig.json"));
  Object.assign(config.compilerOptions, {
    baseUrl: ".",
    paths: { "@tool/*": ["src/*"] },
    ignoreDeprecations: "6.0",
  });
  f.put("tsconfig.json", JSON.stringify(config));
  f.put(
    f.consumer,
    read(f, f.consumer).replaceAll(
      "./feature/calculateTotal.util.mjs",
      "@tool/feature/calculateTotal.util.mjs",
    ),
  );
  checkEsmTypes(f.checkout);
  const plan = await f.runtime.plan(f.command());
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  const done = await f.runtime.apply(applyCommand(plan));
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.equal(
    read(f, f.consumer).split("@tool/moved/calculateTotal.util.mjs").length - 1,
    2,
  );
  checkEsmTypes(f.checkout);
});
test("MTS workspace exports обновляют runtime target и сохраняют typed consumers", async (t) => {
  const f = esmPackageMoveFixture(native, "mts");
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  const compile = () => {
    for (const p of f.consumerConfigs)
      execFileSync(
        process.execPath,
        [
          resolve("node_modules/typescript/bin/tsc"),
          "--project",
          join(f.checkout, p),
          "--skipLibCheck",
        ],
        { encoding: "utf8", timeout: 60_000 },
      );
  };
  const original = f.consumers.map((p) =>
    readFileSync(join(f.checkout, p), "utf8"),
  );
  compile();
  f.control.deniedPaths = f.consumers;
  const plan = await f.runtime.plan(f.command());
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  const done = await f.runtime.apply(applyCommand(plan));
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.equal(f.control.writes, 3);
  assert.ok(
    readFileSync(join(f.checkout, f.configOwner), "utf8").includes(
      "./src/pricing/calculateTotal.util.mjs",
    ),
  );
  assert.deepEqual(
    f.consumers.map((p) => readFileSync(join(f.checkout, p), "utf8")),
    original,
  );
  compile();
  const r = await f.runtime.receipt(getCommand(done));
  assert.deepEqual(
    r!.changedArtifacts!.map((a) => a.path).sort(),
    [f.to, f.configOwner].sort(),
  );
  for (const a of r!.changedArtifacts!)
    assert.equal(a.sha256, sha256Bytes(readFileSync(join(f.checkout, a.path))));
});
for (const variant of [
  "compiled companion",
  "collision",
  "extensionless",
  "consumer ACL",
])
  test(`MTS ${variant} отклоняется до writes`, async (t) => {
    const f = fixture(t);
    if (variant === "compiled companion")
      f.source(
        f.from.replace(/\.mts$/, ".mjs"),
        "export function calculateTotal() { return 42; }",
      );
    if (variant === "collision") f.put(f.to, read(f, f.from));
    if (variant === "extensionless")
      f.put(
        f.from,
        read(f, f.from).replace(
          "./readPrice.service.mjs",
          "./readPrice.service",
        ),
      );
    if (variant === "consumer ACL") f.control.deniedPaths = [f.consumer];
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(f.control.writes, 0);
  });
for (const variant of ["source", "consumer", "config", "ACL"])
  test(`MTS ${variant} drift после preview`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 100,
    });
    const originalSource = read(f, f.from),
      originalConsumer = read(f, f.consumer);
    if (variant === "ACL") f.control.deniedPaths = [f.consumer];
    else {
      const path =
        variant === "source"
          ? f.from
          : variant === "consumer"
            ? f.consumer
            : "tsconfig.json";
      f.put(path, read(f, path) + "\n");
    }
    if (variant === "ACL") {
      const denied = await f.runtime.apply(applyCommand(plan));
      assert.equal(denied.state, "conflict", JSON.stringify(denied));
      assert.equal(denied.error?.code, "FORBIDDEN");
      assert.equal(read(f, f.from), originalSource);
      assert.equal(read(f, f.consumer), originalConsumer);
      assert.equal(existsSync(join(f.checkout, f.to)), false);
    } else
      await assert.rejects(f.runtime.apply(applyCommand(plan)), {
        code: "CONFLICT",
      });
    assert.equal(f.control.writes, 0);
  });
for (const [directory, atWrite] of [
  [false, 1],
  [false, 2],
  [false, 3],
  [true, 1],
  [true, 4],
  [true, 6],
] as const)
  test(`MTS SIGKILL ${directory ? "directory" : "file"} after ${atWrite}: resume и emit`, async (t) => {
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
        sourceKinds: f.sourceKinds,
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
    f = esmMoveFixture(native, root, "src", "mts");
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
    assert.equal(f.control.writes, (directory ? 6 : 3) - atWrite);
    await receipt(
      f,
      done,
      directory
        ? [
            f.destination,
            ...f.members.map((p) => p.replace(f.directory, f.destination)),
            f.consumer,
          ]
        : [f.to, f.consumer],
    );
    runMtsOracle(f.checkout, f.consumer);
  });
