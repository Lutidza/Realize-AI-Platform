/**
 * @file .ai/tools/engineering/test/caseOnlyDirectoryMove.test.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет case-only namespace, полномочия и crash/recovery переименования исходного дерева.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs, {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { sha256Bytes } from "@realize/engineering-runtime";
import type {
  LoadEngineeringNativeInput,
  OperationView,
} from "@realize/engineering-runtime";
import type { ProjectFolderPolicy } from "../src/projectEngineering.index.ts";
import { directoryMoveFixture } from "./directoryMove.fixture.ts";
import {
  applyCommand,
  filesystemFixture,
  getCommand,
  hasCode,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

const from = "src/move/Left",
  to = "src/move/left";
let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(join(homedir(), ".cache", "engineering-case-rename-"));
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
function fixture(
  t: TestContext,
  policies: readonly ProjectFolderPolicy[] = [],
) {
  const f = directoryMoveFixture(native, policies, from, to);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
async function resume(
  f: ReturnType<typeof filesystemFixture>,
  view: OperationView,
) {
  const proposal = await f.runtime.inspectRecovery(getCommand(view));
  assert.deepEqual(proposal.actions, ["resume"], JSON.stringify(proposal));
  const command = {
    ...getCommand(view),
    recoveryPlanId: proposal.recoveryPlanId,
    recoveryPlanHash: proposal.recoveryPlanHash,
    expectedRevision: proposal.revision,
    requestId: randomUUID(),
    action: "resume",
  };
  return { command, done: await f.runtime.recover(command) };
}
async function assertComplete(
  f: ReturnType<typeof filesystemFixture>,
  view: OperationView,
) {
  assert.equal(view.state, "completed", JSON.stringify(view));
  assert.equal(existsSync(join(f.checkout, from)), false);
  const receipt = await f.runtime.receipt(getCommand(view));
  assert.ok(receipt?.changedArtifacts);
  const expected = [
    to,
    to + "/empty",
    to + "/nested",
    to + "/calculateTotal.util.ts",
    to + "/nested/calculateDouble.util.ts",
    "src/move/useTotal.util.ts",
  ];
  assert.deepEqual(
    receipt.changedArtifacts.map((item) => item.path).sort(),
    expected.sort(),
  );
  for (const item of receipt.changedArtifacts) {
    assert.equal(
      item.sha256,
      item.kind === "directory"
        ? null
        : sha256Bytes(readFileSync(join(f.checkout, item.path))),
    );
    assert.deepEqual(Object.keys(item).sort(), ["kind", "path", "sha256"]);
  }
  assert.match(
    readFileSync(join(f.checkout, to, "calculateTotal.util.ts"), "utf8"),
    /@file src\/move\/left\/calculateTotal\.util\.ts/,
  );
  assert.match(
    readFileSync(join(f.checkout, "src/move/useTotal.util.ts"), "utf8"),
    /from "\.\/left\/calculateTotal\.util\.js"/,
  );
}

test("case-only directory rename does not cross an owner boundary", async (t) => {
  const f = fixture(t, [
    {
      id: "other-owner",
      version: "1",
      root: to,
      ownerRef: "foreign",
      purpose: "Другая область владельца",
      boundary: "owner",
      sourcePaths: [policySource],
    },
  ]);
  const result = await f.runtime.plan(f.command());
  assert.equal(result.error?.code, "UNSUPPORTED", JSON.stringify(result));
  assert.equal(f.control.writes, 0);
  assert.ok(existsSync(join(f.checkout, f.source)));
});

for (const scenario of ["noncanonical directory", "public source symbol"])
  test(`case-only rename preserves the naming guard for ${scenario}`, async (t) => {
    const f = fixture(t),
      original = readFileSync(join(f.checkout, f.source));
    const command =
      scenario === "noncanonical directory"
        ? f.command()
        : planCommand([
            {
              kind: "move",
              from: f.source,
              to: f.from + "/CalculateTotal.util.ts",
              expectedVersion: sha256Bytes(original),
            },
          ]);
    if (scenario === "noncanonical directory")
      command.intent.actions[0].to = "src/move/LEFT";
    const result = await f.runtime.plan(command);
    assert.equal(result.error?.code, "UNSUPPORTED", JSON.stringify(result));
    assert.equal(f.control.writes, 0);
    assert.deepEqual(readFileSync(join(f.checkout, f.source)), original);
  });

for (const collision of [
  "exact file",
  "exact directory",
  "third case",
  "Unicode alias",
])
  test(`case-only directory rename preserves ${collision} collision`, async (t) => {
    const f = fixture(t),
      command = f.command();
    const path = join(
      f.checkout,
      collision === "third case"
        ? "src/move/LEFT"
        : collision === "Unicode alias"
          ? "src/move/ＬＥＦＴ"
          : to,
    );
    if (collision === "exact file") writeFileSync(path, "foreign target");
    else mkdirSync(path);
    const identity = statSync(path),
      source = readFileSync(join(f.checkout, f.source));
    const result = await f.runtime.plan(command);
    assert.equal(result.state, "failed", JSON.stringify(result));
    assert.ok(
      ["CONFLICT", "UNSUPPORTED"].includes(result.error!.code),
      JSON.stringify(result),
    );
    assert.equal(f.control.writes, 0);
    assert.equal(statSync(path).ino, identity.ino);
    if (collision === "exact file")
      assert.equal(readFileSync(path, "utf8"), "foreign target");
    assert.deepEqual(readFileSync(join(f.checkout, f.source)), source);
  });

for (const drift of [
  "exact target",
  "third case",
  "source bytes",
  "empty directory",
])
  test(`case-only rename refuses ${drift} changed after preview`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const path = join(
      f.checkout,
      drift === "exact target"
        ? to
        : drift === "third case"
          ? "src/move/LEFT"
          : drift === "source bytes"
            ? f.source
            : f.empty + "/foreign",
    );
    if (drift === "source bytes") writeFileSync(path, "foreign bytes");
    else mkdirSync(path);
    const inode = statSync(path).ino;
    await assert.rejects(
      f.runtime.apply(applyCommand(plan)),
      hasCode("CONFLICT"),
    );
    assert.equal(f.control.writes, 0);
    assert.equal(statSync(path).ino, inode);
    if (drift === "source bytes")
      assert.equal(readFileSync(path, "utf8"), "foreign bytes");
  });

test("case-only rename rechecks ACL after the tree rename and during recovery", async (t) => {
  const f = fixture(t),
    plan = await f.runtime.plan(f.command());
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  f.control.afterWrite = () => {
    if (f.control.writes === 1)
      f.control.deniedPaths = [to + "/calculateTotal.util.ts"];
  };
  const partial = await f.runtime.apply(applyCommand(plan));
  assert.equal(partial.state, "recovery_required");
  assert.equal(f.control.writes, 1);
  assert.equal((await resume(f, partial)).done.state, "recovery_required");
  assert.equal(f.control.writes, 1);
  f.control.deniedPaths = [];
  f.control.afterWrite = undefined;
  const { done, command } = await resume(f, partial);
  await assertComplete(f, done);
  assert.equal(f.control.writes, 4);
  assert.deepEqual(await f.runtime.recover(command), done);
  assert.equal(f.control.writes, 4);
});

for (const atWrite of [1, 2, 3, 4])
  for (const phase of ["before", "after"])
    test(`case-only SIGKILL ${phase} effect ${atWrite} recovers the exact remaining writes`, async (t) => {
      const sample = directoryMoveFixture(native, [], from, to),
        { root, movePolicy } = sample;
      let f: ReturnType<typeof filesystemFixture> = sample;
      t.after(() => {
        f.close();
        rmSync(root, { recursive: true, force: true });
      });
      const plan = await f.runtime.plan(sample.command());
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      const inode = statSync(join(f.checkout, from)).ino,
        input = join(root, "crash.json");
      writeFileSync(
        input,
        JSON.stringify({
          native,
          root,
          movePolicy,
          command: applyCommand(plan),
          phase,
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
      let diagnostic = "";
      child.stderr.on("data", (chunk) => {
        diagnostic += chunk;
      });
      const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
      const [code, signal] = await once(child, "exit").finally(() =>
        clearTimeout(timeout),
      );
      assert.equal(code, null, diagnostic);
      assert.equal(signal, "SIGKILL", diagnostic);
      f = filesystemFixture(native, root, undefined, [], movePolicy);
      const view = await f.runtime.get(getCommand(plan));
      const { done, command } = await resume(f, view);
      await assertComplete(f, done);
      assert.equal(statSync(join(f.checkout, to)).ino, inode);
      const remaining = 4 - atWrite + (phase === "before" ? 1 : 0);
      assert.equal(f.control.writes, remaining);
      assert.deepEqual(await f.runtime.recover(command), done);
      assert.equal(f.control.writes, remaining);
    });

for (const phase of ["before", "after"])
  test(`case-only rename recovers fsync EIO ${phase} rename in the same parent`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const original = fs.fsyncSync,
      path = join(
        f.checkout,
        phase === "before" ? f.source : to + "/calculateTotal.util.ts",
      );
    let failures = 0,
      partial: OperationView;
    fs.fsyncSync = (fd) => {
      if (readlinkSync(`/proc/self/fd/${fd}`) === path) {
        failures++;
        throw Object.assign(Error("injected case rename durability failure"), {
          code: "EIO",
        });
      }
      original(fd);
    };
    syncBuiltinESMExports();
    try {
      partial = await f.runtime.apply(applyCommand(plan));
    } finally {
      fs.fsyncSync = original;
      syncBuiltinESMExports();
    }
    assert.ok(failures > 0);
    assert.equal(partial.state, "recovery_required", JSON.stringify(partial));
    assert.equal(f.control.writes, phase === "before" ? 0 : 1);
    const { done, command } = await resume(f, partial);
    await assertComplete(f, done);
    assert.equal(f.control.writes, 4);
    assert.deepEqual(await f.runtime.recover(command), done);
  });

test("case-only recovery preserves a foreign folded name created after uncertain rename", async (t) => {
  const f = fixture(t),
    plan = await f.runtime.plan(f.command());
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  f.control.failAfterWrite = true;
  const partial = await f.runtime.apply(applyCommand(plan));
  assert.equal(partial.state, "recovery_required");
  const foreign = join(f.checkout, "src/move/LEFT");
  mkdirSync(foreign);
  const proposal = await f.runtime.inspectRecovery(getCommand(partial));
  assert.deepEqual(proposal.actions, []);
  await assert.rejects(
    f.runtime.recover({
      ...getCommand(partial),
      recoveryPlanId: proposal.recoveryPlanId,
      recoveryPlanHash: proposal.recoveryPlanHash,
      expectedRevision: proposal.revision,
      requestId: randomUUID(),
      action: "resume",
    }),
    hasCode("RECOVERY_REQUIRED"),
  );
  assert.equal(f.control.writes, 1);
  assert.ok(existsSync(foreign));
  assert.equal(await f.runtime.receipt(getCommand(partial)), null);
});
