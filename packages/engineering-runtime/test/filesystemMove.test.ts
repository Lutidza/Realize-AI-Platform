/**
 * @file packages/engineering-runtime/test/filesystemMove.test.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет реальный move/recovery общего FS core с независимым от пути тестовым descriptor.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import {
  createLocalFilesystemPorts,
  EngineeringFailure,
  EngineeringRuntime,
  loadEngineeringNative,
  openEngineeringStore,
  sha256Bytes,
} from "../src/engineeringRuntime.server.index.ts";
import type {
  LoadEngineeringNativeInput,
  OperationView,
} from "../src/engineeringRuntime.server.index.ts";
import { installationId, targetId, workspaceId } from "./runtime.fixture.ts";

let nativeInput: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(join(homedir(), ".cache", "engineering-move-native-"));
  nativeInput = JSON.parse(
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
const from = "src/original.util.ts";
const principal = { actorKind: "user", actorId: "1", clientId: "move-fixture" };

function openFixture(root?: string) {
  const base =
    root ?? mkdtempSync(join(homedir(), ".cache", "engineering-move-"));
  const checkout = join(base, "checkout");
  if (!root) {
    mkdirSync(checkout);
    for (const directory of ["src", "other", "foreign"])
      mkdirSync(join(checkout, directory));
    writeFileSync(join(checkout, from), "immutable move bytes — 🦊\r\n");
    chmodSync(join(checkout, from), 0o640);
  }
  const store = openEngineeringStore({
    stateDirectory: join(base, "journal"),
    checkoutRoot: checkout,
    targetId,
    workspaceId,
    installationId,
  });
  const native = loadEngineeringNative(nativeInput),
    control = { writes: 0, failAfterWrite: false };
  const ports = createLocalFilesystemPorts({
    store,
    principal,
    filesDirectory: join(base, "files"),
    native: {
      inspectFd: native.inspectFd,
      renameNoReplace(...args) {
        native.renameNoReplace(...args);
        control.writes++;
        if (control.failAfterWrite) {
          control.failAfterWrite = false;
          throw Error("lost move outcome");
        }
      },
    },
    // Этот trusted fixture не проверяет metadata Realize: её отказ проверяется в project suite.
    descriptors: () => ({
      definitionHash: sha256Bytes("path-independent move fixture v1"),
      resolveExistingFile(input) {
        return this.resolveFile({ ...input, artifactKind: "fixture.code" });
      },
      resolveFile({ path, artifactKind }) {
        if (artifactKind !== "fixture.code")
          throw new EngineeringFailure("UNSUPPORTED", "Fixture kind");
        return {
          kindId: artifactKind,
          definitionVersion: 1,
          ownerRef: path.startsWith("foreign/") ? "foreign" : "fixture",
          provenance: "authored",
          folderPolicyRef: { id: "fixture", version: "1" },
          metadataProfileRef: { id: "fixture", version: "1" },
          templateRef: null,
          ruleRefs: [],
          requiredCheckRefs: [],
          validatedChecks: [],
          readPaths: [],
        };
      },
      resolveDirectory() {
        throw new EngineeringFailure(
          "UNSUPPORTED",
          "Fixture directories are predefined",
        );
      },
    }),
  });
  const runtime = new EngineeringRuntime({
    store,
    principal,
    planner: ports.planner,
    effects: ports.effects,
    content: ports.content,
    authorize: async () => ({ scopeVersion: "1" }),
  });
  let closed = false;
  return {
    root: base,
    checkout,
    runtime,
    control,
    close() {
      if (!closed) {
        closed = true;
        ports.close();
        store.close();
      }
    },
  };
}
function fixture(t: TestContext) {
  const f = openFixture();
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
function planCommand(f: ReturnType<typeof openFixture>, to: string) {
  return {
    schemaVersion: 1,
    targetId,
    requestId: randomUUID(),
    taskRefs: [],
    intent: {
      kind: "file_batch",
      actions: [
        {
          kind: "move",
          from,
          to,
          expectedVersion: sha256Bytes(readFileSync(join(f.checkout, from))),
        },
      ],
    },
  };
}
function applyCommand(plan: OperationView) {
  return {
    schemaVersion: 1,
    operationId: plan.operationId,
    planId: plan.planRef!.planId,
    planHash: plan.planRef!.planHash,
    requestId: randomUUID(),
    expectedRevision: plan.revision,
  };
}

for (const to of [
  "src/renamed.util.ts",
  "other/original.util.ts",
  "src/Original.util.ts",
  "src/ORIGINAL.UTIL.TS",
]) {
  test(`core move to ${to} preserves bytes/mode/inode and replays once`, async (t) => {
    const f = fixture(t),
      path = join(f.checkout, from),
      original = readFileSync(path),
      stat = statSync(path);
    const p = await f.runtime.plan(planCommand(f, to));
    assert.equal(p.state, "planned", JSON.stringify(p));
    const preview = await f.runtime.preview({
      schemaVersion: 1,
      operationId: p.operationId,
      planId: p.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.deepEqual(preview.effects[0].paths, [from, to]);
    const apply = applyCommand(p),
      done = await f.runtime.apply(apply);
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(existsSync(path), false);
    const destination = join(f.checkout, to);
    assert.deepEqual(readFileSync(destination), original);
    assert.equal(statSync(destination).ino, stat.ino);
    assert.equal(statSync(destination).mode, stat.mode);
    assert.deepEqual(await f.runtime.apply(apply), done);
    assert.equal(f.control.writes, 1);
    const receipt = await f.runtime.receipt({
      schemaVersion: 1,
      operationId: p.operationId,
    });
    assert.deepEqual(receipt!.changedArtifacts, [
      { path: to, kind: "file", sha256: sha256Bytes(original) },
    ]);
    assert.deepEqual(receipt!.createdArtifacts, []);
    assert.ok(!JSON.stringify({ preview, receipt }).includes(f.root));
  });
}

test("core move refuses occupied destination, foreign folded collision and owner change", async (t) => {
  const f = fixture(t);
  writeFileSync(
    join(f.checkout, "other/occupied.util.ts"),
    "foreign destination",
  );
  writeFileSync(
    join(f.checkout, "src/OriGinal.util.ts"),
    "foreign folded name",
  );
  for (const [to, code] of [
    ["other/occupied.util.ts", "CONFLICT"],
    ["src/Original.util.ts", "CONFLICT"],
    ["foreign/moved.util.ts", "FORBIDDEN"],
  ]) {
    const p = await f.runtime.plan(planCommand(f, to));
    assert.equal(p.error?.code, code, JSON.stringify(p));
  }
  assert.equal(
    readFileSync(join(f.checkout, "other/occupied.util.ts"), "utf8"),
    "foreign destination",
  );
  assert.equal(f.control.writes, 0);
  assert.equal(existsSync(join(f.checkout, from)), true);
  assert.equal(
    readFileSync(join(f.checkout, "src/OriGinal.util.ts"), "utf8"),
    "foreign folded name",
  );
});

test("core move rejects a destination introduced after preview", async (t) => {
  const f = fixture(t),
    to = "other/moved.util.ts";
  const p = await f.runtime.plan(planCommand(f, to));
  assert.equal(p.state, "planned", JSON.stringify(p));
  writeFileSync(join(f.checkout, to), "foreign destination");
  await assert.rejects(
    f.runtime.apply(applyCommand(p)),
    (e: unknown) => e instanceof EngineeringFailure && e.code === "CONFLICT",
  );
  assert.equal(
    readFileSync(join(f.checkout, to), "utf8"),
    "foreign destination",
  );
  assert.equal(existsSync(join(f.checkout, from)), true);
  assert.equal(f.control.writes, 0);
});

for (const to of ["other/moved.util.ts", "src/Original.util.ts"])
  test(`core move to ${to} reopens durable pending without a second rename`, async () => {
    let f = openFixture();
    const root = f.root;
    try {
      const original = readFileSync(join(f.checkout, from)),
        inode = statSync(join(f.checkout, from)).ino;
      const p = await f.runtime.plan(planCommand(f, to));
      assert.equal(p.state, "planned", JSON.stringify(p));
      f.control.failAfterWrite = true;
      assert.equal(
        (await f.runtime.apply(applyCommand(p))).state,
        "recovery_required",
      );
      f.close();
      f = openFixture(root);
      const get = { schemaVersion: 1, operationId: p.operationId },
        recovery = await f.runtime.inspectRecovery(get);
      assert.deepEqual(recovery.actions, ["resume"]);
      const done = await f.runtime.recover({
        ...get,
        recoveryPlanId: recovery.recoveryPlanId,
        recoveryPlanHash: recovery.recoveryPlanHash,
        expectedRevision: recovery.revision,
        requestId: randomUUID(),
        action: "resume",
      });
      assert.equal(done.state, "completed", JSON.stringify(done));
      assert.equal(f.control.writes, 0);
      assert.equal(existsSync(join(f.checkout, from)), false);
      assert.deepEqual(readFileSync(join(f.checkout, to)), original);
      assert.equal(statSync(join(f.checkout, to)).ino, inode);
    } finally {
      f.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
