/**
 * @file .ai/tools/engineering/test/commonJsMove.test.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Проверяет CJS/CTS native moves, исполнение Node/emit, ACL/drift и SIGKILL recovery.
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
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import {
  commonJsMoveFixture,
  checkCommonJsGraph,
} from "./commonJsMove.fixture.ts";
import { applyCommand, getCommand } from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(
    join(homedir(), ".cache", "engineering-commonjs-native-"),
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
function fixture(t: TestContext, extension: "cjs" | "cts", sourceRoot = "src") {
  const f = commonJsMoveFixture(native, undefined, extension, sourceRoot);
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
for (const extension of ["cjs", "cts"] as const) {
  for (const [name, consumers] of [
    ["calculateTotal.util", ["src/useTotal.service"]],
    [
      "readPrice.service",
      ["src/feature/calculateTotal.util", "src/useTotal.service"],
    ],
    ["requestPrice.adapter", ["src/feature/readPrice.service"]],
    ["Price.adapter", ["src/feature/requestPrice.adapter"]],
  ] as const)
    test(`${extension} ${name}: Node/compiler до/после, preview/receipt/retry`, async (t) => {
      const f = fixture(t, extension),
        from = "src/feature/" + name + "." + extension,
        to = "src/moved/" + name + "." + extension;
      checkCommonJsGraph(f.checkout, f.consumer, extension);
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
      await receipt(f, done, [
        to,
        ...consumers.map((p) => p + "." + extension),
      ]);
      assert.ok(read(f, to).includes("@file " + to));
      checkCommonJsGraph(f.checkout, f.consumer, extension);
      assert.equal(
        (await f.runtime.apply(command)).operationId,
        done.operationId,
      );
      assert.equal(f.control.writes, consumers.length + 2);
    });
  for (const sourceRoot of ["src", ".ai/tools/example"])
    test(`${extension} directory ${sourceRoot}: BOM/CRLF, outgoing require, Node`, async (t) => {
      const f = fixture(t, extension, sourceRoot);
      f.put(f.from, "\uFEFF" + read(f, f.from).replaceAll("\n", "\r\n"));
      checkCommonJsGraph(f.checkout, f.consumer, extension);
      const plan = await f.runtime.plan(f.command(true));
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      assert.equal(f.control.writes, 0);
      const done = await f.runtime.apply(applyCommand(plan));
      assert.equal(done.state, "completed", JSON.stringify(done));
      const moved = f.from.replace(f.directory, f.destination);
      assert.equal(read(f, moved).charCodeAt(0), 0xfeff);
      assert.equal(read(f, moved).replaceAll("\r\n", "").includes("\n"), false);
      assert.ok(
        read(f, f.destination + "/Price.adapter." + extension).includes(
          '"../../shared/basePrice.util.cjs"',
        ),
      );
      await receipt(f, done, [
        f.destination,
        ...f.members.map((p) => p.replace(f.directory, f.destination)),
        f.consumer,
      ]);
      assert.equal(f.control.writes, 6);
      checkCommonJsGraph(f.checkout, f.consumer, extension);
    });
  test(`${extension} paths alias сохраняет .cjs target, compiler до/после`, async (t) => {
    const f = fixture(t, extension),
      config = JSON.parse(read(f, "tsconfig.json"));
    Object.assign(config.compilerOptions, {
      baseUrl: ".",
      paths: { "@tool/*": ["src/*"] },
    });
    f.put("tsconfig.json", JSON.stringify(config));
    f.put(
      f.consumer,
      read(f, f.consumer).replaceAll(
        "./feature/calculateTotal.util.cjs",
        "@tool/feature/calculateTotal.util.cjs",
      ),
    );
    checkCommonJsGraph(f.checkout, f.consumer, extension, false);
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const done = await f.runtime.apply(applyCommand(plan));
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(
      read(f, f.consumer).split("@tool/moved/calculateTotal.util.cjs").length -
        1,
      2,
    );
    checkCommonJsGraph(f.checkout, f.consumer, extension, false);
  });
  for (const variant of [
    "shadowed require",
    "property require",
    "computed require",
    "with scope",
    "eval scope",
    "missing target",
    "extensionless",
    "companion",
    "collision",
    "unknown profile",
  ])
    test(`${extension} plan rejects ${variant} без writes`, async (t) => {
      const f = fixture(t, extension);
      if (variant === "shadowed require")
        f.source(
          f.from,
          'function calculateTotal(require){return require("./readPrice.service.cjs");}',
        );
      if (variant === "property require")
        f.source(
          f.from,
          'function calculateTotal(){return module.require("./readPrice.service.cjs");}',
        );
      if (variant === "computed require")
        f.source(
          f.from,
          'function calculateTotal(){const name="readPrice.service.cjs";return require("./"+name);}',
        );
      if (variant === "with scope")
        f.source(
          f.from,
          'with (loader) { require("./readPrice.service.cjs"); } function calculateTotal(){return 42;}',
        );
      if (variant === "eval scope")
        f.source(
          f.from,
          'function calculateTotal(){eval("var require = loader");return require("./readPrice.service.cjs");}',
        );
      if (variant === "missing target")
        f.put(
          f.from,
          read(f, f.from).replace(
            "./readPrice.service.cjs",
            "./missing.service.cjs",
          ),
        );
      if (variant === "extensionless")
        f.put(
          f.from,
          read(f, f.from).replace(
            "./readPrice.service.cjs",
            "./readPrice.service",
          ),
        );
      if (variant === "companion")
        f.source(
          f.from.replace(
            /\.(?:cjs|cts)$/,
            extension === "cjs" ? ".cts" : ".cjs",
          ),
          "function calculateTotal(){return 0;} module.exports={calculateTotal};",
        );
      if (variant === "collision") f.source(f.to, f.files.get(f.from)!);
      if (variant === "unknown profile")
        f.put("src/unknown.config." + extension, "module.exports={};");
      const plan = await f.runtime.plan(f.command());
      assert.equal(plan.state, "failed", JSON.stringify(plan));
      assert.equal(f.control.writes, 0);
    });
  for (const write of [false, true])
    test(`${extension} consumer ${write ? "write" : "read"} ACL до/после preview`, async (t) => {
      const f = fixture(t, extension),
        key = write ? "deniedPaths" : "deniedReadPaths";
      f.control[key] = [f.consumer];
      assert.equal(
        (await f.runtime.plan(f.command())).error?.code,
        "FORBIDDEN",
      );
      f.control[key] = [];
      const plan = await f.runtime.plan(f.command());
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      await f.runtime.preview({
        ...getCommand(plan),
        planId: plan.planRef!.planId,
        after: null,
        limit: 100,
      });
      const original = read(f, f.from),
        consumer = read(f, f.consumer);
      f.control[key] = [f.consumer];
      if (write) {
        const denied = await f.runtime.apply(applyCommand(plan));
        assert.equal(denied.state, "conflict", JSON.stringify(denied));
        assert.equal(denied.error?.code, "FORBIDDEN");
      } else {
        try {
          const denied = await f.runtime.apply(applyCommand(plan));
          assert.notEqual(denied.state, "completed");
          assert.equal(denied.error?.code, "FORBIDDEN");
        } catch (error) {
          assert.equal((error as { code: string }).code, "FORBIDDEN");
        }
      }
      assert.equal(f.control.writes, 0);
      assert.equal(read(f, f.from), original);
      assert.equal(read(f, f.consumer), consumer);
      assert.equal(existsSync(join(f.checkout, f.to)), false);
    });
  for (const variant of ["source", "consumer", "config"])
    test(`${extension} ${variant} drift после preview`, async (t) => {
      const f = fixture(t, extension),
        plan = await f.runtime.plan(f.command());
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      await f.runtime.preview({
        ...getCommand(plan),
        planId: plan.planRef!.planId,
        after: null,
        limit: 100,
      });
      const path =
        variant === "source"
          ? f.from
          : variant === "consumer"
            ? f.consumer
            : "tsconfig.json";
      f.put(path, read(f, path) + "\n");
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
    test(`${extension} SIGKILL ${directory ? "directory" : "file"} after ${atWrite}: frozen resume`, async (t) => {
      let f = fixture(t, extension);
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
      f = commonJsMoveFixture(native, root, extension);
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
      checkCommonJsGraph(f.checkout, f.consumer, extension);
    });
}
