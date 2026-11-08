/**
 * @file .ai/tools/engineering/test/directoryMoveFailures.test.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет границы, drift, ACL, настоящие process crashes и durability directory move.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs, {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
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

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(
    join(homedir(), ".cache", "engineering-directory-failures-"),
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

function fixture(
  t: TestContext,
  policies: readonly ProjectFolderPolicy[] = [],
) {
  const f = directoryMoveFixture(native, policies);
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
async function assertReceipt(
  f: ReturnType<typeof filesystemFixture>,
  done: OperationView,
) {
  assert.equal(done.state, "completed", JSON.stringify(done));
  const receipt = await f.runtime.receipt(getCommand(done));
  assert.ok(receipt?.changedArtifacts);
  const root = "src/move/right/relocated";
  assert.deepEqual(
    receipt.changedArtifacts.map((item) => item.path).sort(),
    [
      root,
      root + "/empty",
      root + "/nested",
      root + "/calculateTotal.util.ts",
      root + "/nested/calculateDouble.util.ts",
      "src/move/useTotal.util.ts",
    ].sort(),
  );
  for (const item of receipt.changedArtifacts) {
    assert.equal(
      item.sha256,
      item.kind === "file"
        ? sha256Bytes(readFileSync(join(f.checkout, item.path)))
        : null,
    );
    assert.deepEqual(Object.keys(item).sort(), ["kind", "path", "sha256"]);
  }
}

for (const destination of [
  "src/move/left",
  "src/move/left/child",
  "src/move",
  "src/move/Left",
  "src/move/missing/target",
])
  test(`directory destination ${destination} is rejected before mutation`, async (t) => {
    const f = fixture(t),
      command = f.command(),
      version = f.ports.directoryVersion(f.from);
    command.intent.actions[0].to = destination;
    const result = await f.runtime.plan(command);
    assert.equal(result.state, "failed", JSON.stringify(result));
    assert.equal(f.control.writes, 0);
    assert.equal(f.ports.directoryVersion(f.from), version);
  });

for (const collision of ["directory", "file", "folded-name"])
  test(`directory move preserves existing ${collision} destination`, async (t) => {
    const f = fixture(t),
      command = f.command();
    const target =
      collision === "folded-name"
        ? f.to.replace("relocated", "Relocated")
        : f.to;
    if (collision === "file")
      writeFileSync(join(f.checkout, target), "foreign destination");
    else mkdirSync(join(f.checkout, target));
    const inode = statSync(join(f.checkout, target)).ino;
    const result = await f.runtime.plan(command);
    assert.equal(result.state, "failed", JSON.stringify(result));
    assert.equal(result.error?.code, "CONFLICT", JSON.stringify(result));
    assert.equal(f.control.writes, 0);
    assert.equal(statSync(join(f.checkout, target)).ino, inode);
    assert.ok(existsSync(join(f.checkout, f.source)));
  });

for (const root of [
  "src/move/right",
  "src/move/left/nested",
  "src/move/left/empty",
])
  test(`directory move rejects owner boundary at ${root}`, async (t) => {
    const f = fixture(t, [
      {
        id: "other-owner",
        version: "1",
        root,
        ownerRef: "another-owner",
        purpose: "Другая область владельца",
        boundary: "owner",
        allowedKinds: ["source.util"],
        allowedProvenance: ["authored"],
        sourcePaths: [policySource],
      },
    ]);
    const result = await f.runtime.plan(f.command());
    assert.equal(result.state, "failed", JSON.stringify(result));
    assert.equal(result.error?.code, "UNSUPPORTED", JSON.stringify(result));
    assert.equal(f.control.writes, 0);
    assert.ok(existsSync(join(f.checkout, f.source)));
  });

for (const count of [32, 33])
  test(`directory object bound ${count} includes the root and empty directories`, async (t) => {
    const f = fixture(t),
      command = f.command();
    for (let index = 0; index < count - 5; index++)
      mkdirSync(join(f.checkout, f.from, `empty-${index}`));
    if (count === 32)
      command.intent.actions[0].expectedVersion = f.ports.directoryVersion(
        f.from,
      );
    else
      assert.throws(
        () => f.ports.directoryVersion(f.from),
        hasCode("LIMIT_EXCEEDED"),
      );
    const plan = await f.runtime.plan(command);
    if (count === 33) {
      assert.equal(plan.error?.code, "LIMIT_EXCEEDED", JSON.stringify(plan));
      assert.equal(f.control.writes, 0);
      return;
    }
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const preview = await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.equal(preview.effects[0].movedArtifacts!.length, 32);
    assert.equal(preview.effects[0].paths.length, 64);
    const done = await f.runtime.apply(applyCommand(plan));
    assert.equal(done.state, "completed", JSON.stringify(done));
    const receipt = await f.runtime.receipt(getCommand(done));
    assert.equal(receipt!.changedArtifacts!.length, 33);
  });

for (const kind of [
  "unknown-kind",
  "symlink",
  "hardlink",
  "special-mode",
  "xattr",
  "case-collision",
  "unicode-collision",
  "excluded-directory",
])
  test(`directory tree rejects ${kind} without moving supported files`, async (t) => {
    const f = fixture(t),
      command = f.command(),
      original = readFileSync(join(f.checkout, f.source));
    if (kind === "unknown-kind")
      writeFileSync(join(f.checkout, f.from, "unknown.json"), "{}");
    if (kind === "symlink")
      symlinkSync(
        join(f.checkout, f.source),
        join(f.checkout, f.from, "linked.util.ts"),
      );
    if (kind === "hardlink")
      linkSync(
        join(f.checkout, f.source),
        join(f.checkout, f.from, "linked.util.ts"),
      );
    if (kind === "special-mode") chmodSync(join(f.checkout, f.empty), 0o1755);
    if (kind === "xattr")
      execFileSync("python3", [
        "-c",
        "import os,sys; os.setxattr(sys.argv[1], b'user.engineering_test', b'1')",
        join(f.checkout, f.source),
      ]);
    if (kind === "case-collision") mkdirSync(join(f.checkout, f.from, "Empty"));
    if (kind === "unicode-collision")
      mkdirSync(join(f.checkout, f.from, "ＥＭＰＴＹ"));
    if (kind === "excluded-directory")
      mkdirSync(join(f.checkout, f.from, "node_modules"));
    // Для допустимого чтения version обновляем, чтобы проверять kind/placement, а не stale hash.
    if (["unknown-kind", "excluded-directory"].includes(kind))
      command.intent.actions[0].expectedVersion = f.ports.directoryVersion(
        f.from,
      );
    const plan = await f.runtime.plan(command);
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.ok(
      ["UNSUPPORTED", "CONFLICT"].includes(plan.error!.code),
      JSON.stringify(plan),
    );
    assert.equal(f.control.writes, 0);
    assert.deepEqual(readFileSync(join(f.checkout, f.source)), original);
    assert.equal(existsSync(join(f.checkout, f.to)), false);
  });

test("directory move rejects a real foreign tmpfs mount in an isolated namespace", async (t) => {
  const f = fixture(t),
    command = f.command(),
    original = readFileSync(join(f.checkout, f.nested));
  const input = join(f.root, "mount.json");
  writeFileSync(
    input,
    JSON.stringify({
      native,
      root: f.root,
      command,
      movePolicy: f.movePolicy,
      mountPath: f.from + "/nested",
    }),
  );
  f.close();
  const output = execFileSync(
    "unshare",
    [
      "--user",
      "--map-root-user",
      "--mount",
      "--propagation",
      "private",
      process.execPath,
      "--import",
      "tsx",
      ".ai/tools/engineering/test/directoryMount.worker.ts",
      input,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  const result = JSON.parse(output);
  assert.equal(result.differentDevice, true);
  assert.equal(result.result.error?.code, "UNSUPPORTED", output);
  assert.equal(result.writes, 0);
  assert.deepEqual(readFileSync(join(f.checkout, f.nested)), original);
});

test("directory move requires a single action and leaves reference roots in place", async (t) => {
  const f = fixture(t),
    move = f.command().intent.actions[0];
  for (const actions of [
    [
      move,
      {
        kind: "remove",
        path: "src/move/helper.util.ts",
        expectedVersion: sha256Bytes(
          readFileSync(join(f.checkout, "src/move/helper.util.ts")),
        ),
      },
    ],
    [
      {
        ...move,
        from: "src/move",
        to: "src/elsewhere",
        expectedVersion: f.ports.directoryVersion("src/move"),
      },
    ],
  ]) {
    const result = await f.runtime.plan(planCommand(actions));
    assert.equal(result.error?.code, "UNSUPPORTED", JSON.stringify(result));
    assert.equal(f.control.writes, 0);
  }
});

const drifts: readonly (readonly [
  string,
  (f: ReturnType<typeof directoryMoveFixture>) => void,
])[] = [
  [
    "file bytes",
    (f) =>
      writeFileSync(
        join(f.checkout, f.source),
        readFileSync(join(f.checkout, f.source), "utf8") + "\n// foreign\n",
      ),
  ],
  [
    "file inode",
    (f) => {
      const bytes = readFileSync(join(f.checkout, f.source));
      renameSync(join(f.checkout, f.source), join(f.root, "original-source"));
      writeFileSync(join(f.checkout, f.source), bytes);
    },
  ],
  ["file mode", (f) => chmodSync(join(f.checkout, f.source), 0o600)],
  [
    "directory inode",
    (f) => {
      renameSync(join(f.checkout, f.empty), join(f.root, "original-empty"));
      mkdirSync(join(f.checkout, f.empty));
    },
  ],
  ["directory mode", (f) => chmodSync(join(f.checkout, f.empty), 0o700)],
  ["added directory", (f) => mkdirSync(join(f.checkout, f.from, "added"))],
  [
    "removed directory",
    (f) => rmSync(join(f.checkout, f.empty), { recursive: true }),
  ],
  [
    "renamed directory",
    (f) =>
      renameSync(
        join(f.checkout, f.empty),
        join(f.checkout, f.from, "renamed"),
      ),
  ],
  [
    "external consumer",
    (f) =>
      writeFileSync(
        join(f.checkout, f.consumer),
        readFileSync(join(f.checkout, f.consumer), "utf8") + "\n// foreign\n",
      ),
  ],
  [
    "policy source",
    (f) =>
      writeFileSync(
        join(f.checkout, policySource),
        readFileSync(join(f.checkout, policySource), "utf8") +
          "\n// policy changed\n",
      ),
  ],
  ["occupied destination", (f) => mkdirSync(join(f.checkout, f.to))],
  [
    "destination parent inode",
    (f) => {
      renameSync(
        join(f.checkout, "src/move/right"),
        join(f.root, "original-parent"),
      );
      mkdirSync(join(f.checkout, "src/move/right"));
    },
  ],
];
for (const [name, mutate] of drifts)
  test(`directory apply preserves foreign ${name} after plan`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    mutate(f);
    const version = f.ports.directoryVersion(f.from);
    await assert.rejects(
      f.runtime.apply(applyCommand(plan)),
      hasCode("CONFLICT"),
    );
    assert.equal(f.control.writes, 0);
    assert.equal(f.ports.directoryVersion(f.from), version);
  });

test("directory plan rejects a stale whole-tree version", async (t) => {
  const f = fixture(t),
    command = f.command();
  mkdirSync(join(f.checkout, f.from, "new-empty"));
  const plan = await f.runtime.plan(command);
  assert.equal(plan.error?.code, "CONFLICT", JSON.stringify(plan));
  assert.equal(f.control.writes, 0);
});

for (const phase of ["plan", "apply"])
  for (const relative of [
    "",
    "/calculateTotal.util.ts",
    "/empty",
    "/nested",
    "/nested/calculateDouble.util.ts",
  ])
    for (const side of ["source", "destination"])
      test(`directory ${phase} enforces ${side} ACL for ${relative || "root"}`, async (t) => {
        const f = fixture(t),
          command = f.command(),
          denied = (side === "source" ? f.from : f.to) + relative;
        if (phase === "plan") f.control.deniedPaths = [denied];
        const plan = await f.runtime.plan(command);
        if (phase === "apply")
          assert.equal(plan.state, "planned", JSON.stringify(plan));
        f.control.deniedPaths = [denied];
        const result =
          phase === "plan" ? plan : await f.runtime.apply(applyCommand(plan));
        assert.equal(result.error?.code, "FORBIDDEN", JSON.stringify(result));
        assert.equal(f.control.writes, 0);
        assert.equal(
          f.ports.directoryVersion(f.from),
          command.intent.actions[0].expectedVersion,
        );
        assert.equal(existsSync(join(f.checkout, f.to)), false);
      });

for (const stopAfter of [1, 2, 3])
  test(`directory ACL revocation after step ${stopAfter} blocks the next write and recovery`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const preview = await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 100,
    });
    const denied = preview.effects[stopAfter].paths[0];
    f.control.afterWrite = () => {
      if (f.control.writes === stopAfter) f.control.deniedPaths = [denied];
    };
    const partial = await f.runtime.apply(applyCommand(plan));
    assert.equal(partial.state, "recovery_required", JSON.stringify(partial));
    assert.equal(f.control.writes, stopAfter);
    assert.equal((await resume(f, partial)).done.state, "recovery_required");
    assert.equal(f.control.writes, stopAfter);
    f.control.afterWrite = undefined;
    f.control.deniedPaths = [];
    const { done, command } = await resume(f, partial);
    await assertReceipt(f, done);
    assert.equal(f.control.writes, 4);
    assert.deepEqual(await f.runtime.recover(command), done);
    assert.equal(f.control.writes, 4);
  });

for (const atWrite of [1, 2, 3, 4])
  for (const phase of ["before", "after"])
    test(`SIGKILL ${phase} directory effect ${atWrite} recovers without repeating completed writes`, async (t) => {
      const sample = directoryMoveFixture(native),
        { root, movePolicy, to } = sample;
      let f: ReturnType<typeof filesystemFixture> = sample;
      t.after(() => {
        f.close();
        rmSync(root, { recursive: true, force: true });
      });
      const plan = await f.runtime.plan(sample.command());
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      const originalInode = statSync(join(f.checkout, sample.from)).ino;
      const input = join(root, "crash.json");
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
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let diagnostics = "";
      child.stderr.on("data", (chunk) => {
        diagnostics += chunk;
      });
      const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
      const [code, signal] = await once(child, "exit").finally(() =>
        clearTimeout(timeout),
      );
      assert.equal(code, null, diagnostics);
      assert.equal(signal, "SIGKILL", diagnostics);
      f = filesystemFixture(native, root, undefined, [], movePolicy);
      const view = await f.runtime.get(getCommand(plan));
      const { done, command } = await resume(f, view);
      await assertReceipt(f, done);
      const remaining = 4 - atWrite + (phase === "before" ? 1 : 0);
      assert.equal(f.control.writes, remaining);
      assert.equal(statSync(join(f.checkout, to)).ino, originalInode);
      assert.deepEqual(await f.runtime.recover(command), done);
      assert.equal(f.control.writes, remaining);
    });

for (const barrier of [
  "before-tree-rename",
  "after-tree-rename",
  "recovery-after-rename",
])
  test(`injected fsync EIO at ${barrier} leaves recoverable state and never repeats rename`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    let partial: OperationView = plan;
    if (barrier === "recovery-after-rename") {
      f.control.failAfterWrite = true;
      partial = await f.runtime.apply(applyCommand(plan));
      assert.equal(partial.state, "recovery_required");
      assert.equal(f.control.writes, 1);
    }
    const originalFsync = fs.fsyncSync;
    const target = join(
      f.checkout,
      barrier === "before-tree-rename"
        ? f.nested
        : f.to + "/nested/calculateDouble.util.ts",
    );
    let failures = 0;
    fs.fsyncSync = (fd) => {
      if (readlinkSync(`/proc/self/fd/${fd}`) === target) {
        failures++;
        throw Object.assign(
          new Error("injected filesystem durability failure"),
          { code: "EIO" },
        );
      }
      originalFsync(fd);
    };
    syncBuiltinESMExports();
    try {
      if (barrier === "recovery-after-rename")
        await assert.rejects(resume(f, partial));
      else partial = await f.runtime.apply(applyCommand(plan));
    } finally {
      fs.fsyncSync = originalFsync;
      syncBuiltinESMExports();
    }
    assert.ok(failures > 0, "real fsync call must reach the injected failure");
    assert.equal(partial.state, "recovery_required", JSON.stringify(partial));
    assert.equal(f.control.writes, barrier === "before-tree-rename" ? 0 : 1);
    const { done, command } = await resume(f, partial);
    await assertReceipt(f, done);
    assert.equal(f.control.writes, 4);
    assert.deepEqual(await f.runtime.recover(command), done);
  });

test("directory durability flushes all descendants before and after rename", async (t) => {
  const f = fixture(t),
    plan = await f.runtime.plan(f.command());
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  const originalFsync = fs.fsyncSync,
    before = new Set<string>(),
    after = new Set<string>();
  fs.fsyncSync = (fd) => {
    const path = readlinkSync(`/proc/self/fd/${fd}`);
    if (f.control.writes === 0) before.add(path);
    if (f.control.writes === 1) after.add(path);
    originalFsync(fd);
  };
  syncBuiltinESMExports();
  try {
    await assertReceipt(f, await f.runtime.apply(applyCommand(plan)));
  } finally {
    fs.fsyncSync = originalFsync;
    syncBuiltinESMExports();
  }
  for (const suffix of [
    "",
    "/empty",
    "/nested",
    "/calculateTotal.util.ts",
    "/nested/calculateDouble.util.ts",
  ]) {
    assert.ok(
      before.has(join(f.checkout, f.from + suffix)),
      `before fsync ${suffix}`,
    );
    assert.ok(
      after.has(join(f.checkout, f.to + suffix)),
      `after fsync ${suffix}`,
    );
  }
  assert.ok(after.has(join(f.checkout, "src/move")));
  assert.ok(after.has(join(f.checkout, "src/move/right")));
});

for (const drift of [
  "moved file",
  "empty directory",
  "external consumer",
  "source recreated",
])
  test(`directory recovery refuses foreign ${drift} after uncertain rename`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    f.control.failAfterWrite = true;
    const partial = await f.runtime.apply(applyCommand(plan));
    assert.equal(partial.state, "recovery_required");
    if (drift === "moved file")
      writeFileSync(
        join(f.checkout, f.to, "calculateTotal.util.ts"),
        "foreign bytes",
      );
    if (drift === "empty directory")
      mkdirSync(join(f.checkout, f.to, "empty", "foreign"));
    if (drift === "external consumer")
      writeFileSync(join(f.checkout, f.consumer), "foreign consumer");
    if (drift === "source recreated") mkdirSync(join(f.checkout, f.from));
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
    assert.equal(await f.runtime.receipt(getCommand(partial)), null);
  });

test("directory recovery preserves a corrupted retained original without claiming completion", async (t) => {
  const f = fixture(t),
    plan = await f.runtime.plan(f.command()),
    original = readFileSync(join(f.checkout, f.source));
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  f.control.afterWrite = () => {
    if (f.control.writes === 2) f.control.failAfterWrite = true;
  };
  const partial = await f.runtime.apply(applyCommand(plan));
  assert.equal(partial.state, "recovery_required");
  assert.equal(f.control.writes, 2);
  const stage = readdirSync(join(f.root, "files")).find(
    (name) => name !== "content",
  );
  assert.ok(stage);
  const backup = join(f.root, "files", stage, "1");
  assert.deepEqual(readFileSync(backup), original);
  writeFileSync(backup, "foreign retained bytes");
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
  assert.equal(readFileSync(backup, "utf8"), "foreign retained bytes");
  assert.equal(f.control.writes, 2);
  assert.equal(await f.runtime.receipt(getCommand(partial)), null);
});

test("directory recovery rejects a proposal made before foreign tree drift", async (t) => {
  const f = fixture(t),
    plan = await f.runtime.plan(f.command());
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  f.control.failAfterWrite = true;
  const partial = await f.runtime.apply(applyCommand(plan));
  assert.equal(partial.state, "recovery_required");
  const proposal = await f.runtime.inspectRecovery(getCommand(partial));
  assert.deepEqual(proposal.actions, ["resume"]);
  const foreign = join(f.checkout, f.to, "empty", "foreign");
  mkdirSync(foreign);
  await assert.rejects(
    f.runtime.recover({
      ...getCommand(partial),
      recoveryPlanId: proposal.recoveryPlanId,
      recoveryPlanHash: proposal.recoveryPlanHash,
      expectedRevision: proposal.revision,
      requestId: randomUUID(),
      action: "resume",
    }),
    hasCode("CONFLICT"),
  );
  assert.ok(statSync(foreign).isDirectory());
  assert.equal(f.control.writes, 1);
  assert.equal(await f.runtime.receipt(getCommand(partial)), null);
});

test("directory move cannot waive a descendant required check", async (t) => {
  const f = fixture(t, [
      {
        id: "checked-nested",
        version: "1",
        root: "src/move/left/nested",
        ownerRef: "fixture",
        purpose: "Область обязательной проверки",
        boundary: "feature",
        requiredCheckRefs: ["project.typecheck"],
        sourcePaths: [policySource],
      },
    ]),
    result = await f.runtime.plan(f.command());
  assert.equal(result.state, "failed", JSON.stringify(result));
  assert.equal(result.error?.code, "UNSUPPORTED", JSON.stringify(result));
  assert.equal(f.control.writes, 0);
  assert.ok(existsSync(join(f.checkout, f.nested)));
});

test("directory move rejects invalid source metadata even with a current tree version", async (t) => {
  const f = fixture(t),
    invalid = readFileSync(join(f.checkout, f.source), "utf8").replace(
      "@file " + f.source,
      "@file src/wrong.util.ts",
    );
  writeFileSync(join(f.checkout, f.source), invalid);
  const result = await f.runtime.plan(f.command());
  assert.equal(result.state, "failed", JSON.stringify(result));
  assert.equal(result.error?.code, "INVALID_INPUT", JSON.stringify(result));
  assert.equal(f.control.writes, 0);
  assert.equal(readFileSync(join(f.checkout, f.source), "utf8"), invalid);
});
