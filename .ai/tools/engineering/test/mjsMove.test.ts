/**
 * @file .ai/tools/engineering/test/mjsMove.test.ts
 * @version 1.2.0
 * @date 2026-10-30
 * @description Проверяет native MJS moves с Node/checkJs, aliases/exports, ACL/drift и SIGKILL recovery.
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
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import {
  esmMoveFixture,
  esmPackageMoveFixture,
  runMjsOracle,
  checkEsmTypes,
} from "./esmMove.fixture.ts";
import {
  applyCommand,
  getCommand,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(join(homedir(), ".cache", "engineering-mjs-native-"));
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
  const f = esmMoveFixture(native, undefined, sourceRoot);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
type Fixture = ReturnType<typeof esmMoveFixture>;
const read = (f: Fixture, path: string) =>
  readFileSync(join(f.checkout, path), "utf8");
async function assertReceipt(
  f: Fixture,
  view: Awaited<ReturnType<Fixture["runtime"]["apply"]>>,
  paths: string[],
) {
  const receipt = await f.runtime.receipt(getCommand(view));
  assert.deepEqual(
    receipt!.changedArtifacts!.map((a) => a.path).sort(),
    paths.sort(),
  );
  for (const item of receipt!.changedArtifacts!)
    if (item.sha256 !== null)
      assert.equal(
        item.sha256,
        sha256Bytes(readFileSync(join(f.checkout, item.path))),
      );
}
for (const [name, consumers] of [
  ["calculateTotal.util.mjs", ["src/useTotal.service.mjs"]],
  [
    "readPrice.service.mjs",
    ["src/feature/calculateTotal.util.mjs", "src/useTotal.service.mjs"],
  ],
  ["requestPrice.adapter.mjs", ["src/feature/readPrice.service.mjs"]],
  ["Price.adapter.mjs", ["src/feature/requestPrice.adapter.mjs"]],
] as const)
  test(`MJS ${name}: native file move, Node/checkJs до/после и полный receipt`, async (t) => {
    const f = fixture(t),
      from = "src/feature/" + name,
      to = "src/moved/" + name;
    const original = read(f, from),
      config = read(f, "tsconfig.json"),
      manifest = read(f, "package.json");
    runMjsOracle(f.checkout, f.consumer);
    checkEsmTypes(f.checkout);
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
    assert.equal(read(f, "package.json"), manifest);
    assert.ok(read(f, to).includes(`@file ${to}`));
    await assertReceipt(f, done, [to, ...consumers]);
    runMjsOracle(f.checkout, f.consumer);
    checkEsmTypes(f.checkout);
    assert.equal(
      (await f.runtime.apply(command)).operationId,
      done.operationId,
    );
    assert.equal(f.control.writes, consumers.length + 2);
  });
for (const sourceRoot of ["src", ".ai/tools/example"])
  test(`MJS directory ${sourceRoot}: BOM/CRLF, outgoing import и ESM под commonjs package`, async (t) => {
    const f = fixture(t, sourceRoot);
    f.put(f.from, "\uFEFF" + read(f, f.from).replaceAll("\n", "\r\n"));
    runMjsOracle(f.checkout, f.consumer);
    checkEsmTypes(f.checkout);
    const plan = await f.runtime.plan(f.command(true));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    assert.equal(f.control.writes, 0);
    const done = await f.runtime.apply(applyCommand(plan));
    assert.equal(done.state, "completed", JSON.stringify(done));
    const target = f.from.replace(f.directory, f.destination),
      content = read(f, target);
    assert.equal(content.charCodeAt(0), 0xfeff);
    assert.equal(content.replaceAll("\r\n", "").includes("\n"), false);
    assert.ok(
      read(f, f.destination + "/Price.adapter.mjs").includes(
        '"../../shared/basePrice.util.mjs"',
      ),
    );
    await assertReceipt(f, done, [
      f.destination,
      ...f.members.map((p) => p.replace(f.directory, f.destination)),
      f.consumer,
    ]);
    assert.equal(f.control.writes, 6);
    runMjsOracle(f.checkout, f.consumer);
    checkEsmTypes(f.checkout);
  });
for (const variant of [
  "missing target",
  "extensionless",
  "require",
  "computed import",
  "collision",
  "unknown profile",
  "typed MJS",
])
  test(`MJS plan rejects ${variant} до writes`, async (t) => {
    const f = fixture(t);
    if (variant === "missing target")
      f.put(
        f.from,
        read(f, f.from).replace(
          "./readPrice.service.mjs",
          "./missing.service.mjs",
        ),
      );
    if (variant === "extensionless")
      f.put(
        f.from,
        read(f, f.from).replace(
          "./readPrice.service.mjs",
          "./readPrice.service",
        ),
      );
    if (variant === "require")
      f.source(
        f.from,
        'export function calculateTotal() { return require("./readPrice.service.mjs"); }',
      );
    if (variant === "computed import")
      f.source(
        f.from,
        'export function calculateTotal() { const name = "readPrice.service.mjs"; return import("./" + name); }',
      );
    if (variant === "collision") f.put(f.to, read(f, f.from));
    if (variant === "unknown profile")
      f.put("src/extra.config.cjs", "module.exports = {};");
    if (variant === "typed MJS")
      f.put(
        f.from,
        read(f, f.from).replace("calculateTotal()", "calculateTotal(): number"),
      );
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(f.control.writes, 0);
  });
for (const [path, write] of [
  ["src/useTotal.service.mjs", false],
  ["src/useTotal.service.mjs", true],
  ["src/feature/calculateTotal.util.mjs", true],
  ["tsconfig.json", false],
] as const)
  test(`MJS ${write ? "write" : "read"} ACL ${path} до/после preview`, async (t) => {
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
for (const variant of ["source", "consumer", "config", "namespace", "policy"])
  test(`MJS frozen manifest проверяет ${variant} drift`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    if (variant === "namespace") mkdirSync(join(f.checkout, "src/empty"));
    else {
      const path =
        variant === "source"
          ? f.from
          : variant === "consumer"
            ? f.consumer
            : variant === "config"
              ? "tsconfig.json"
              : policySource;
      f.put(path, read(f, path) + "\n");
    }
    await assert.rejects(f.runtime.apply(applyCommand(plan)), {
      code: "CONFLICT",
    });
    assert.equal(f.control.writes, 0);
  });
test("MJS aliases используют прежний compiler contract и extension style", async (t) => {
  const f = fixture(t),
    config = JSON.parse(read(f, "tsconfig.json"));
  config.compilerOptions.baseUrl = ".";
  config.compilerOptions.paths = { "@tool/*": ["src/*"] };
  config.compilerOptions.ignoreDeprecations = "6.0";
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
test("MJS exact package exports сохраняют реальные workspace consumers", async (t) => {
  const f = esmPackageMoveFixture(native);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  const consumer = f.consumers[0],
    from = f.from,
    to = f.to;
  const oracle = () => {
    assert.equal(
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            "--input-type=module",
            "--eval",
            "const m=await import(process.argv[1]);console.log(JSON.stringify(m.useTotal()));",
            pathToFileURL(join(f.checkout, consumer)).href,
          ],
          { cwd: f.checkout, encoding: "utf8", timeout: 30_000 },
        ),
      ),
      43,
    );
    for (const path of f.consumerConfigs)
      execFileSync(
        process.execPath,
        [
          resolve("node_modules/typescript/bin/tsc"),
          "--project",
          join(f.checkout, path),
          "--skipLibCheck",
        ],
        { encoding: "utf8", timeout: 60_000 },
      );
  };
  oracle();
  const original = readFileSync(join(f.checkout, consumer), "utf8");
  f.control.deniedPaths = f.consumers;
  const plan = await f.runtime.plan(
    planCommand([
      {
        kind: "move",
        from,
        to,
        expectedVersion: sha256Bytes(readFileSync(join(f.checkout, from))),
      },
    ]),
  );
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  const done = await f.runtime.apply(applyCommand(plan));
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.equal(f.control.writes, 3);
  assert.equal(readFileSync(join(f.checkout, consumer), "utf8"), original);
  assert.ok(
    readFileSync(join(f.checkout, f.configOwner), "utf8").includes(
      "./src/pricing/calculateTotal.util.mjs",
    ),
  );
  oracle();
});
for (const [directory, atWrite] of [
  [false, 1],
  [false, 2],
  [false, 3],
  [true, 1],
  [true, 4],
  [true, 6],
] as const)
  test(`MJS SIGKILL ${directory ? "directory" : "file"} after effect ${atWrite}: frozen resume`, async (t) => {
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
    f = esmMoveFixture(native, root);
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
    await assertReceipt(
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
    runMjsOracle(f.checkout, f.consumer);
  });
