/**
 * @file .ai/tools/engineering/test/projectConfigMove.test.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Проверяет non-nearest projects на native FS: selectors, compiler oracle, ACL, drift и SIGKILL/recovery.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import {
  projectConfigMoveFixture,
  projectConfigs,
} from "./projectConfigMove.fixture.ts";
import {
  applyCommand,
  getCommand,
  planCommand,
  filesystemFixture,
  policySource,
} from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(
    join(homedir(), ".cache", "engineering-projects-native-"),
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

function fixture(t: TestContext) {
  const f = projectConfigMoveFixture(native);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
type Fixture = ReturnType<typeof projectConfigMoveFixture>;
const read = (f: Fixture, path: string) =>
  readFileSync(join(f.checkout, path), "utf8");
const command = (f: Fixture, directory: boolean) =>
  directory
    ? planCommand([
        {
          kind: "move",
          from: "src/math",
          to: "src/pricing/math",
          expectedVersion: f.ports.directoryVersion("src/math"),
        },
      ])
    : f.command();
const readonlyPaths = [
  ...projectConfigs,
  "config/selectors.json",
  "src/useTotal.util.ts",
  "src/roundPrice.util.ts",
];

for (const directory of [false, true])
  test(`explicit projects ${directory ? "directory" : "file"}: preview, receipt, retry и tsc --project`, async (t) => {
    const f = fixture(t),
      originals = readonlyPaths.map((path) => [path, read(f, path)] as const);
    f.control.deniedPaths = readonlyPaths;
    const plan = await f.runtime.plan(command(f, directory));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const preview = await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.equal(preview.effects.length, 4);
    assert.equal(f.control.writes, 0);
    const config = read(f, "tsconfig.json"),
      apply = applyCommand(plan);
    const done = await f.runtime.apply(apply);
    assert.equal(done.state, "completed", JSON.stringify(done));
    const destination = directory
      ? "src/pricing/math/calculateTotal.util.ts"
      : f.to;
    assert.equal(
      read(f, "tsconfig.json"),
      config.replaceAll(
        "src/math/calculateTotal.util",
        destination.slice(0, -3),
      ),
    );
    for (const [path, original] of originals)
      assert.equal(read(f, path), original);
    const receipt = await f.runtime.receipt(getCommand(done));
    assert.deepEqual(
      receipt!.changedArtifacts!.map((item) => item.path).sort(),
      [
        destination,
        "tsconfig.json",
        f.relativeConsumer,
        ...(directory ? ["src/pricing/math"] : []),
      ].sort(),
    );
    for (const item of receipt!.changedArtifacts!)
      if (item.sha256 !== null)
        assert.equal(
          item.sha256,
          sha256Bytes(readFileSync(join(f.checkout, item.path))),
        );
    assert.equal((await f.runtime.apply(apply)).operationId, done.operationId);
    assert.equal(f.control.writes, 4);
    for (const configPath of ["tsconfig.json", ...projectConfigs])
      execFileSync(
        process.execPath,
        [
          resolve("node_modules/typescript/bin/tsc"),
          "--project",
          join(f.checkout, configPath),
          "--noEmit",
          "--ignoreDeprecations",
          "6.0",
          "--target",
          "ES2018",
          "--module",
          "ESNext",
          "--skipLibCheck",
        ],
        { encoding: "utf8", timeout: 60_000 },
      );
  });

for (const [name, config] of [
  ["baseUrl", { compilerOptions: { baseUrl: "." } }],
  [
    "other paths owner",
    {
      compilerOptions: {
        paths: { "@total": ["src/math/calculateTotal.util"] },
      },
    },
  ],
  ["moduleSuffixes", { compilerOptions: { moduleSuffixes: [".native", ""] } }],
  ["project references", { references: [{ path: "../other" }] }],
  ["missing literal", { files: ["../src/missing.util.ts"], include: [] }],
  [
    "moving literal",
    { files: ["../src/math/calculateTotal.util.ts"], include: [] },
  ],
  ["include loses root", { include: ["../src/math/**/*"] }],
  ["exclude loses root", { exclude: ["../src/pricing/**/*"] }],
  ["exclude gains root", { exclude: ["../src/math/**/*"] }],
  ["unknown option", { compilerOptions: { unknownOption: true } }],
] as const)
  test(`explicit project rejects ${name} before writes`, async (t) => {
    const f = fixture(t);
    f.put(
      projectConfigs[0],
      JSON.stringify({ extends: "./selectors", ...config }),
    );
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.error?.code, "UNSUPPORTED", JSON.stringify(plan));
    assert.equal(f.control.writes, 0);
  });

test("explicit project проверяет outgoing wildcard references без exact mappings", async (t) => {
  const f = fixture(t);
  f.configure({ "@app/*": ["src/*"] }, { include: ["src/**/*"] });
  f.utility(
    f.consumer,
    'import { calculateTotal } from "@app/math/calculateTotal.util";\nexport function useTotal() { return calculateTotal(); }',
  );
  f.put(
    projectConfigs[1],
    '{"extends":"../tsconfig","files":["../src/useTotal.util.ts"],"include":[],"compilerOptions":{"moduleSuffixes":[".native",""]}}',
  );
  const plan = await f.runtime.plan(f.command());
  assert.equal(plan.error?.code, "UNSUPPORTED", JSON.stringify(plan));
  assert.equal(f.control.writes, 0);
});

for (const path of [
  projectConfigs[0],
  projectConfigs[1],
  "config/selectors.json",
])
  test(`explicit project read ACL ${path} before plan and after preview`, async (t) => {
    const f = fixture(t);
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

for (const drift of [
  "config",
  "selectors",
  "extends",
  "policy source",
  "inventory",
  "catalog",
])
  test(`explicit project drift ${drift} invalidates frozen plan`, async (t) => {
    const f = fixture(t);
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    let runtime = f.runtime;
    if (drift === "inventory")
      f.utility("src/late.util.ts", "export function late() { return 1; }");
    else if (drift === "extends")
      f.put(projectConfigs[0], '{"extends":"../tsconfig"}');
    else if (drift === "catalog") {
      f.close();
      f.put("config/extra.json", '{"extends":"../tsconfig"}');
      const reopened = filesystemFixture(
        native,
        f.root,
        undefined,
        [],
        {
          ...f.movePolicy,
          tsconfigWrite: {
            ...f.movePolicy.tsconfigWrite!,
            projectConfigPaths: [...projectConfigs, "config/extra.json"],
          },
        },
        f.extraFolderPolicies,
      );
      runtime = reopened.runtime;
      t.after(() => reopened.close());
    } else {
      const path =
        drift === "selectors"
          ? "config/selectors.json"
          : drift === "policy source"
            ? policySource
            : projectConfigs[1];
      f.put(path, read(f, path) + "\n// drift\n");
    }
    await assert.rejects(runtime.apply(applyCommand(plan)), {
      code: "CONFLICT",
    });
    assert.equal(f.control.writes, 0);
  });

test("explicit config ACL revoked during apply blocks recovery until restored", async (t) => {
  const f = fixture(t),
    plan = await f.runtime.plan(f.command());
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  f.control.afterWrite = () => {
    if (f.control.writes === 1) f.control.deniedReadPaths = [projectConfigs[1]];
  };
  const partial = await f.runtime.apply(applyCommand(plan));
  assert.equal(partial.state, "recovery_required", JSON.stringify(partial));
  await assert.rejects(f.runtime.inspectRecovery(getCommand(partial)), {
    code: "FORBIDDEN",
  });
  f.control.deniedReadPaths = [];
  f.control.afterWrite = undefined;
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
  assert.equal(f.control.writes, 4);
});

for (const directory of [false, true])
  for (const atWrite of [3, 4])
    test(`explicit projects SIGKILL ${directory ? "directory" : "file"} at ${atWrite} resumes frozen plan`, async (t) => {
      let f = fixture(t);
      const plan = await f.runtime.plan(command(f, directory));
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
      f = projectConfigMoveFixture(native, root);
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
      assert.equal(f.control.writes, 4 - atWrite);
      const receipt = await f.runtime.receipt(getCommand(done));
      for (const item of receipt!.changedArtifacts!)
        if (item.sha256 !== null)
          assert.equal(
            item.sha256,
            sha256Bytes(readFileSync(join(f.checkout, item.path))),
          );
    });
