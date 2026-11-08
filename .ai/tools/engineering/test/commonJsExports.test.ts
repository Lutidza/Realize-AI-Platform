/**
 * @file .ai/tools/engineering/test/commonJsExports.test.ts
 * @version 1.0.0
 * @date 2026-11-02
 * @description Проверяет CommonJS package moves, неизменные consumers, Node/compiler и frozen recovery.
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
  commonJsExportsFixture,
  checkCommonJsExportsGraph,
} from "./commonJsExports.fixture.ts";
import { applyCommand, getCommand } from "./filesystemIntegration.fixture.ts";
import { renderSourceTemplate } from "../src/renderSourceTemplate.util.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(join(homedir(), ".cache", "engineering-cjs-exports-"));
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
type Fixture = ReturnType<typeof commonJsExportsFixture>;
function fixture(
  t: TestContext,
  extension: "cjs" | "cts",
  root = false,
  glob = true,
) {
  const f = commonJsExportsFixture(native, undefined, extension, root, glob);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
const read = (f: Fixture, path: string) =>
  readFileSync(join(f.checkout, path), "utf8");
async function preview(
  f: Fixture,
  plan: Awaited<ReturnType<Fixture["runtime"]["plan"]>>,
) {
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  return f.runtime.preview({
    ...getCommand(plan),
    planId: plan.planRef!.planId,
    after: null,
    limit: 100,
  });
}
async function assertReceipt(
  f: Fixture,
  done: Awaited<ReturnType<Fixture["runtime"]["apply"]>>,
  directory: boolean,
) {
  const r = await f.runtime.receipt(getCommand(done));
  assert.deepEqual(
    r!.changedArtifacts!.map((a) => a.path).sort(),
    [
      f.configOwner,
      ...(directory
        ? [
            f.targetDirectory,
            f.targetDirectory + "/detail",
            ...f.members.map((p) =>
              p.replace(f.sourceDirectory, f.targetDirectory),
            ),
          ]
        : [f.to]),
    ].sort(),
  );
  for (const a of r!.changedArtifacts!)
    if (a.sha256 !== null)
      assert.equal(
        a.sha256,
        sha256Bytes(readFileSync(join(f.checkout, a.path))),
      );
}
for (const extension of ["cjs", "cts"] as const) {
  for (const root of [false, true])
    for (const directory of [false, true])
      test(`${extension} ${root ? "root/literal" : "subpaths/glob"} ${directory ? "tree" : "file"}: compiler/Node, preview/receipt/retry`, async (t) => {
        const f = fixture(t, extension, root, !root);
        const originals = new Map(
          [...f.files.keys()].map((p) => [p, read(f, p)]),
        );
        const changed = new Set([
          f.configOwner,
          ...(directory ? f.members : [f.from]),
        ]);
        const readonly = [...f.files.keys()].filter((p) => !changed.has(p));
        f.control.deniedPaths = readonly;
        checkCommonJsExportsGraph(f.checkout, extension);
        const plan = await f.runtime.plan(f.command(directory)),
          p = await preview(f, plan);
        const expected = directory ? 5 : 3;
        assert.equal(p.effects.length, expected);
        assert.equal(f.control.writes, 0);
        assert.equal(
          p.effects.filter((e) => e.paths.includes(f.configOwner)).length,
          1,
        );
        for (const [path, text] of originals) assert.equal(read(f, path), text);
        const command = applyCommand(plan),
          done = await f.runtime.apply(command);
        assert.equal(done.state, "completed", JSON.stringify(done));
        assert.equal(
          read(f, f.configOwner),
          originals
            .get(f.configOwner)!
            .replaceAll(
              directory
                ? "./src/domain"
                : "./src/domain/calculateTotal.util.cjs",
              directory
                ? "./src/pricing/domain"
                : "./src/pricing/calculateTotal.util.cjs",
            ),
        );
        for (const path of readonly)
          assert.equal(read(f, path), originals.get(path), path);
        assert.equal(
          existsSync(join(f.checkout, directory ? f.sourceDirectory : f.from)),
          false,
        );
        await assertReceipt(f, done, directory);
        checkCommonJsExportsGraph(f.checkout, extension);
        assert.equal(
          (await f.runtime.apply(command)).operationId,
          done.operationId,
        );
        assert.equal(f.control.writes, expected);
      });
  for (const variant of [
    "conditional unused",
    "wildcard",
    "missing target",
    "companion",
    "collision",
    "node10",
    "nodenext",
    "conditional peer",
    "baseUrl shadow",
    "nested boundary",
    "shadowed require",
  ])
    test(`${extension} package plan refuses ${variant} without writes`, async (t) => {
      const f = fixture(t, extension);
      const owner = JSON.parse(read(f, f.configOwner).replace(/^\uFEFF/u, ""));
      if (variant === "conditional unused")
        owner.exports["./unused"] = { require: owner.exports["./unused"] };
      if (variant === "wildcard") owner.exports["./*"] = "./src/domain/*.cjs";
      if (variant === "missing target")
        owner.exports["./unused"] = "./src/missing.util.cjs";
      if (
        ["conditional unused", "wildcard", "missing target"].includes(variant)
      )
        f.put(f.configOwner, JSON.stringify(owner));
      if (variant === "companion") {
        const path = f.from.replace(
          /\.(?:cjs|cts)$/,
          extension === "cjs" ? ".cts" : ".cjs",
        );
        f.put(
          path,
          renderSourceTemplate({
            path,
            createdOn: "2026-11-02",
            descriptionRu: "Проверяет неоднозначный companion.",
            body: "function calculateTotal(){return 0;} module.exports={calculateTotal};",
          }),
        );
      }
      if (variant === "collision")
        f.put(f.to, read(f, f.from).replace(f.from, f.to));
      if (variant === "node10" || variant === "nodenext") {
        const config = JSON.parse(read(f, f.consumerConfigs[0]));
        config.compilerOptions.moduleResolution = variant;
        f.put(f.consumerConfigs[0], JSON.stringify(config));
      }
      if (variant === "conditional peer")
        f.put(
          "packages/shared/package.json",
          '{"name":"@fixture/shared","exports":{"require":"./src/sharedValue.util.cjs"}}',
        );
      if (variant === "baseUrl shadow") {
        const config = JSON.parse(read(f, f.consumerConfigs[1]));
        config.compilerOptions.baseUrl = ".";
        f.put(f.consumerConfigs[1], JSON.stringify(config));
        f.put("packages/app/@fixture/math.cjs", "module.exports={};");
      }
      if (variant === "nested boundary")
        f.put(
          "packages/math/src/pricing/package.json",
          '{"name":"@fixture/nested"}',
        );
      if (variant === "shadowed require")
        f.put(
          f.consumers[0],
          read(f, f.consumers[0]).replace(
            "function useTotal()",
            "function useTotal(require)",
          ),
        );
      const plan = await f.runtime.plan(f.command());
      assert.equal(plan.state, "failed", JSON.stringify(plan));
      assert.equal(f.control.writes, 0);
    });
  for (const variant of [
    "owner write",
    "owner read",
    "consumer read",
    "namespace read",
  ])
    test(`${extension} ${variant} ACL before plan/after preview`, async (t) => {
      const f = fixture(t, extension),
        path = variant.startsWith("owner")
          ? f.configOwner
          : variant === "consumer read"
            ? f.consumers[0]
            : "packages";
      const key = variant === "owner write" ? "deniedPaths" : "deniedReadPaths";
      f.control[key] = [path];
      assert.equal(
        (await f.runtime.plan(f.command())).error?.code,
        "FORBIDDEN",
      );
      f.control[key] = [];
      const plan = await f.runtime.plan(f.command());
      await preview(f, plan);
      const bytes = [f.from, f.configOwner, ...f.consumers].map(
        (p) => [p, read(f, p)] as const,
      );
      f.control[key] = [path];
      try {
        const denied = await f.runtime.apply(applyCommand(plan));
        assert.notEqual(denied.state, "completed");
        assert.equal(denied.error?.code, "FORBIDDEN");
      } catch (e) {
        assert.equal((e as { code: string }).code, "FORBIDDEN");
      }
      assert.equal(f.control.writes, 0);
      assert.equal(existsSync(join(f.checkout, f.to)), false);
      for (const [p, original] of bytes) assert.equal(read(f, p), original);
    });
  for (const variant of ["owner", "config", "consumer", "peer", "new package"])
    test(`${extension} ${variant} drift after preview blocks writes`, async (t) => {
      const f = fixture(t, extension),
        plan = await f.runtime.plan(f.command());
      await preview(f, plan);
      if (variant === "new package")
        f.put("packages/added/package.json", '{"name":"@fixture/added"}');
      else {
        const path =
          variant === "owner"
            ? f.configOwner
            : variant === "config"
              ? f.consumerConfigs[1]
              : variant === "consumer"
                ? f.consumers[0]
                : "packages/shared/package.json";
        f.put(path, read(f, path) + "\n");
      }
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
    [true, 3],
    [true, 5],
  ] as const)
    test(`${extension} SIGKILL ${directory ? "tree" : "file"} after ${atWrite}: frozen resume`, async (t) => {
      let f = fixture(t, extension);
      const plan = await f.runtime.plan(f.command(directory));
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      const original = read(f, f.configOwner),
        root = f.root,
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
      child.stderr.on("data", (b) => {
        stderr += b;
      });
      const [code, signal] = await once(child, "exit");
      assert.equal(code, null, stderr);
      assert.equal(signal, "SIGKILL", stderr);
      f = commonJsExportsFixture(native, root, extension);
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
      assert.equal(
        read(f, f.configOwner),
        original.replaceAll(
          directory ? "./src/domain" : "./src/domain/calculateTotal.util.cjs",
          directory
            ? "./src/pricing/domain"
            : "./src/pricing/calculateTotal.util.cjs",
        ),
      );
      await assertReceipt(f, done, directory);
      checkCommonJsExportsGraph(f.checkout, extension);
    });
}
