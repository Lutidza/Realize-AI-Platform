/**
 * @file .ai/tools/engineering/test/filesystemMutations.test.ts
 * @version 1.0.1
 * @date 2026-10-28
 * @description Проверяет version-checked edit, quarantine и границы move на реальном filesystem binding.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { sha256Bytes } from "@realize/engineering-runtime";
import type {
  LoadEngineeringNativeInput,
  OperationView,
} from "@realize/engineering-runtime";
import {
  aiPath,
  applyCommand,
  contentCommand,
  filesystemFixture,
  getCommand,
  hasCode,
  planCommand,
  source,
  sourcePath,
  template,
} from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(
    join(homedir(), ".cache", "engineering-mutations-native-"),
  );
  native = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/buildEngineeringNative.mjs", "--output", build],
      {
        encoding: "utf8",
        timeout: 60_000,
      },
    ),
  );
});
after(() => {
  if (build) rmSync(build, { recursive: true, force: true });
});

function fixture(t: TestContext, requiredChecks: readonly string[] = []) {
  const f = filesystemFixture(native, undefined, undefined, requiredChecks);
  mkdirSync(join(f.checkout, "src/nested"));
  writeFileSync(join(f.checkout, sourcePath), source());
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}

async function mutationPlan(
  f: ReturnType<typeof filesystemFixture>,
  kind: "edit_file" | "remove",
  path = sourcePath,
) {
  const original = readFileSync(join(f.checkout, path));
  if (kind === "remove")
    return f.runtime.plan(
      planCommand([{ kind, path, expectedVersion: sha256Bytes(original) }]),
    );
  const content = await f.runtime.prepareContent(
    contentCommand(
      Buffer.from(
        original.toString("utf8").replace("Вычисляет", "Проверяет и вычисляет"),
      ),
    ),
  );
  return f.runtime.plan(
    planCommand([
      {
        kind,
        path,
        expectedSha256: sha256Bytes(original),
        contentRef: content.contentRef,
      },
    ]),
  );
}

async function resumeCommand(
  f: ReturnType<typeof filesystemFixture>,
  plan: OperationView,
) {
  const recovery = await f.runtime.inspectRecovery(getCommand(plan));
  assert.deepEqual(recovery.actions, ["resume"]);
  return {
    ...getCommand(plan),
    recoveryPlanId: recovery.recoveryPlanId,
    recoveryPlanHash: recovery.recoveryPlanHash,
    expectedRevision: recovery.revision,
    requestId: randomUUID(),
    action: "resume",
  };
}

test("edit preserves exact UTF-8/CRLF bytes and mode, retains original inode and replays once", async (t) => {
  const f = fixture(t);
  const path = join(f.checkout, sourcePath);
  chmodSync(path, 0o640);
  const original = readFileSync(path);
  const originalInode = statSync(path).ino;
  const replacement = Buffer.from(
    original
      .toString("utf8")
      .replace("сумму", "сумму — 🦊")
      .replaceAll("\n", "\r\n")
      .trimEnd(),
  );
  const content = await f.runtime.prepareContent(contentCommand(replacement));
  const plan = await f.runtime.plan(
    planCommand([
      {
        kind: "edit_file",
        path: sourcePath,
        expectedSha256: sha256Bytes(original),
        contentRef: content.contentRef,
      },
    ]),
  );
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  const preview = await f.runtime.preview({
    ...getCommand(plan),
    planId: plan.planRef!.planId,
    after: null,
    limit: 100,
  });
  assert.match(preview.effects[0].diff!, /сумму — 🦊/);
  const apply = applyCommand(plan);
  const done = await f.runtime.apply(apply);
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.deepEqual(readFileSync(path), replacement);
  assert.equal(statSync(path).mode & 0o777, 0o640);
  const newInode = statSync(path).ino;
  assert.notEqual(newInode, originalInode);
  const stage = readdirSync(join(f.root, "files")).find(
    (entry) => entry !== "content",
  )!;
  const backup = join(f.root, "files", stage, "0");
  assert.deepEqual(readFileSync(backup), original);
  assert.equal(statSync(backup).ino, originalInode);
  assert.deepEqual(await f.runtime.apply(apply), done);
  assert.equal(statSync(path).ino, newInode);
  const receipt = await f.runtime.receipt(getCommand(done));
  assert.deepEqual(receipt!.createdArtifacts, []);
  assert.deepEqual(receipt!.changedArtifacts, [
    { path: sourcePath, kind: "file", sha256: sha256Bytes(replacement) },
  ]);
  assert.ok(!JSON.stringify({ preview, receipt }).includes(f.root));
});

test("remove keeps exact bytes and inode in private quarantine and replays without unlink", async (t) => {
  const f = fixture(t);
  const path = join(f.checkout, sourcePath);
  const original = readFileSync(path),
    inode = statSync(path).ino;
  const plan = await f.runtime.plan(
    planCommand([
      {
        kind: "remove",
        path: sourcePath,
        expectedVersion: sha256Bytes(original),
      },
    ]),
  );
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  const apply = applyCommand(plan),
    done = await f.runtime.apply(apply);
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.equal(existsSync(path), false);
  const stage = readdirSync(join(f.root, "files")).find(
    (entry) => entry !== "content",
  )!;
  const retained = join(f.root, "files", stage, "0");
  assert.deepEqual(readFileSync(retained), original);
  assert.equal(statSync(retained).ino, inode);
  assert.deepEqual(await f.runtime.apply(apply), done);
  assert.equal(statSync(retained).ino, inode);
});

test("edit validates AI template metadata and persists exact new content", async (t) => {
  const f = fixture(t);
  mkdirSync(join(f.checkout, ".ai/templates/engineering"));
  const original = template(),
    replacement = Buffer.from(
      Buffer.from(original)
        .toString("utf8")
        .replace("Проверь назначение", "Проверь результат и назначение"),
    );
  writeFileSync(join(f.checkout, aiPath), original);
  const content = await f.runtime.prepareContent(contentCommand(replacement));
  const plan = await f.runtime.plan(
    planCommand([
      {
        kind: "edit_file",
        path: aiPath,
        expectedSha256: sha256Bytes(original),
        contentRef: content.contentRef,
      },
    ]),
  );
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  assert.equal((await f.runtime.apply(applyCommand(plan))).state, "completed");
  assert.deepEqual(readFileSync(join(f.checkout, aiPath)), replacement);
});

for (const kind of ["edit_file", "remove"] as const) {
  test(`${kind} rejects a stale source hash without modifying checkout`, async (t) => {
    const f = fixture(t),
      original = readFileSync(join(f.checkout, sourcePath));
    const content = await f.runtime.prepareContent(contentCommand(source()));
    const action =
      kind === "edit_file"
        ? {
            kind,
            path: sourcePath,
            expectedSha256: "0".repeat(64),
            contentRef: content.contentRef,
          }
        : { kind, path: sourcePath, expectedVersion: "0".repeat(64) };
    const plan = await f.runtime.plan(planCommand([action]));
    assert.equal(plan.error?.code, "CONFLICT");
    assert.deepEqual(readFileSync(join(f.checkout, sourcePath)), original);
    assert.equal(f.control.writes, 0);
  });

  for (const change of ["bytes", "inode", "mode", "namespace"] as const) {
    test(`${kind} preserves a foreign ${change} change made after planning`, async (t) => {
      const f = fixture(t),
        path = join(f.checkout, sourcePath);
      const plan = await mutationPlan(f, kind);
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      if (change === "bytes") writeFileSync(path, "foreign version");
      if (change === "inode") {
        writeFileSync(`${path}.replacement`, readFileSync(path));
        renameSync(`${path}.replacement`, path);
      }
      if (change === "mode") chmodSync(path, 0o600);
      if (change === "namespace")
        writeFileSync(
          join(f.checkout, "src/nested/foreign.txt"),
          "foreign sibling",
        );
      const before = readFileSync(path),
        inode = statSync(path).ino,
        mode = statSync(path).mode;
      await assert.rejects(
        f.runtime.apply(applyCommand(plan)),
        hasCode("CONFLICT"),
      );
      assert.deepEqual(readFileSync(path), before);
      assert.equal(statSync(path).ino, inode);
      assert.equal(statSync(path).mode, mode);
      assert.equal(f.control.writes, 0);
    });
  }

  test(`${kind} recovers a lost native result only after a durable barrier`, async (t) => {
    const f = fixture(t),
      plan = await mutationPlan(f, kind);
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    f.control.failAfterWrite = true;
    const interrupted = await f.runtime.apply(applyCommand(plan));
    assert.equal(interrupted.state, "recovery_required");
    f.close();
    const reopened = filesystemFixture(native, f.root);
    t.after(() => reopened.close());
    const command = await resumeCommand(reopened, interrupted);
    reopened.control.failDurability = true;
    await assert.rejects(
      reopened.runtime.recover(command),
      hasCode("INTERNAL_ERROR"),
    );
    assert.equal(
      (await reopened.runtime.get(getCommand(plan))).state,
      "recovery_required",
    );
    reopened.control.failDurability = false;
    const done = await reopened.runtime.recover(command);
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(reopened.control.writes, 0);
    assert.equal(reopened.control.confirmations, 2);
    assert.deepEqual(await reopened.runtime.recover(command), done);
  });

  test(`${kind} refuses recovery if the retained original bytes are replaced`, async (t) => {
    const f = fixture(t),
      plan = await mutationPlan(f, kind);
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    f.control.failAfterWrite = true;
    const interrupted = await f.runtime.apply(applyCommand(plan));
    assert.equal(interrupted.state, "recovery_required");
    const stage = readdirSync(join(f.root, "files")).find(
      (entry) => entry !== "content",
    )!;
    writeFileSync(join(f.root, "files", stage, "0"), "foreign retained bytes");
    const proposal = await f.runtime.inspectRecovery(getCommand(plan));
    assert.deepEqual(proposal.actions, []);
    await assert.rejects(
      f.runtime.recover({
        ...getCommand(plan),
        recoveryPlanId: proposal.recoveryPlanId,
        recoveryPlanHash: proposal.recoveryPlanHash,
        expectedRevision: proposal.revision,
        requestId: randomUUID(),
        action: "resume",
      }),
      hasCode("RECOVERY_REQUIRED"),
    );
    assert.equal(f.control.writes, 1);
  });

  for (const phase of ["before", "after"] as const) {
    test(`${kind} resumes after SIGKILL ${phase} syscall without repeating a completed mutation`, async (t) => {
      const f = fixture(t),
        plan = await mutationPlan(f, kind);
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      const input = join(f.root, "worker.json");
      writeFileSync(
        input,
        JSON.stringify({
          native,
          root: f.root,
          command: applyCommand(plan),
          phase,
        }),
        { mode: 0o600 },
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
        diagnostic = (diagnostic + String(chunk)).slice(-4096);
      });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, 20_000);
      const [code, signal] = await once(child, "exit");
      clearTimeout(timer);
      assert.equal(timedOut, false, diagnostic);
      assert.equal(code, null, diagnostic);
      assert.equal(signal, "SIGKILL", diagnostic);
      const reopened = filesystemFixture(native, f.root);
      t.after(() => reopened.close());
      const command = await resumeCommand(reopened, plan);
      const done = await reopened.runtime.recover(command);
      assert.equal(done.state, "completed", JSON.stringify(done));
      assert.equal(reopened.control.writes, phase === "before" ? 1 : 0);
      assert.equal(reopened.control.confirmations, phase === "after" ? 1 : 0);
      assert.equal(
        existsSync(join(reopened.checkout, sourcePath)),
        kind === "edit_file",
      );
    });
  }
}

test("edit rejects invalid metadata, invalid encoding and an excessive preview before any mutation", async (t) => {
  const f = fixture(t),
    original = readFileSync(join(f.checkout, sourcePath));
  for (const replacement of [
    Buffer.from("export const broken = 1;"),
    Buffer.from([0xff, 0xfe]),
    Buffer.concat([original, Buffer.from(`\n/*${"x".repeat(129 * 1024)}*/`)]),
  ]) {
    const c = await f.runtime.prepareContent(contentCommand(replacement));
    const p = await f.runtime.plan(
      planCommand([
        {
          kind: "edit_file",
          path: sourcePath,
          expectedSha256: sha256Bytes(original),
          contentRef: c.contentRef,
        },
      ]),
    );
    assert.equal(p.state, "failed", JSON.stringify(p));
    assert.ok(["INVALID_INPUT", "LIMIT_EXCEEDED"].includes(p.error!.code));
  }
  assert.deepEqual(readFileSync(join(f.checkout, sourcePath)), original);
  assert.equal(f.control.writes, 0);
});

test("unsupported generated-like source and missing required checks cannot be edited", async (t) => {
  const f = fixture(t);
  const generated = "src/nested/generated.ts";
  writeFileSync(
    join(f.checkout, generated),
    "// generated\nexport const value = 1;\n",
  );
  const denied = await mutationPlan(f, "edit_file", generated);
  assert.equal(denied.error?.code, "UNSUPPORTED");
  const restricted = fixture(t, ["project.typecheck"]);
  const unchecked = await mutationPlan(restricted, "edit_file");
  assert.equal(unchecked.error?.code, "UNSUPPORTED");
  assert.equal(restricted.control.writes, 0);
  assert.equal(f.control.writes, 0);
});

test("edit respects revoked authorization and duplicate action paths", async (t) => {
  const f = fixture(t),
    p = await mutationPlan(f, "edit_file");
  assert.equal(p.state, "planned", JSON.stringify(p));
  f.control.allowed = false;
  await assert.rejects(f.runtime.apply(applyCommand(p)), hasCode("FORBIDDEN"));
  f.control.allowed = true;
  const duplicate = {
    kind: "remove",
    path: sourcePath,
    expectedVersion: sha256Bytes(source()),
  };
  const q = await f.runtime.plan(planCommand([duplicate, duplicate]));
  assert.equal(q.error?.code, "CONFLICT");
  assert.equal(f.control.writes, 0);
});

test("project move refuses source/template path metadata drift without rewriting or deleting bytes", async (t) => {
  const f = fixture(t);
  mkdirSync(join(f.checkout, "src/other"));
  mkdirSync(join(f.checkout, ".ai/templates/engineering"));
  mkdirSync(join(f.checkout, ".ai/templates/other"));
  writeFileSync(join(f.checkout, aiPath), template());
  for (const [from, to] of [
    [sourcePath, "src/other/calculateTotal.util.ts"],
    [aiPath, ".ai/templates/other/TEMPLATE-ARTIFACT-REVIEW.md"],
  ]) {
    const original = readFileSync(join(f.checkout, from));
    const p = await f.runtime.plan(
      planCommand([
        { kind: "move", from, to, expectedVersion: sha256Bytes(original) },
      ]),
    );
    assert.equal(p.error?.code, "UNSUPPORTED", JSON.stringify(p));
    assert.deepEqual(readFileSync(join(f.checkout, from)), original);
    assert.equal(existsSync(join(f.checkout, to)), false);
  }
  assert.equal(f.control.writes, 0);
});

test("directory move without complete policy and directory remove keep the tree", async (t) => {
  const f = fixture(t);
  for (const action of [
    {
      kind: "move",
      from: "src/nested",
      to: "src/other",
      expectedVersion: f.ports.directoryVersion("src/nested"),
    },
    { kind: "remove", path: "src/nested", expectedVersion: "0".repeat(64) },
  ]) {
    const p = await f.runtime.plan(planCommand([action]));
    assert.equal(p.error?.code, "UNSUPPORTED", JSON.stringify(p));
    assert.deepEqual(
      readFileSync(join(f.checkout, sourcePath)),
      Buffer.from(source()),
    );
  }
  assert.equal(f.control.writes, 0);
});

test("partial batch keeps the foreign next file and blocks unsafe recovery", async (t) => {
  const f = fixture(t),
    second = "src/other/calculateTotal.util.ts";
  mkdirSync(join(f.checkout, "src/other"));
  const secondBytes = source(second);
  writeFileSync(join(f.checkout, second), secondBytes);
  const c = await f.runtime.prepareContent(
    contentCommand(
      Buffer.from(
        Buffer.from(source())
          .toString("utf8")
          .replace("Вычисляет", "Проверяет и вычисляет"),
      ),
    ),
  );
  const p = await f.runtime.plan(
    planCommand([
      {
        kind: "edit_file",
        path: sourcePath,
        expectedSha256: sha256Bytes(source()),
        contentRef: c.contentRef,
      },
      {
        kind: "remove",
        path: second,
        expectedVersion: sha256Bytes(secondBytes),
      },
    ]),
  );
  assert.equal(p.state, "planned", JSON.stringify(p));
  f.control.afterWrite = () =>
    writeFileSync(join(f.checkout, second), "foreign next file");
  const interrupted = await f.runtime.apply(applyCommand(p));
  assert.equal(interrupted.state, "recovery_required");
  assert.equal(f.control.writes, 1);
  assert.equal(
    readFileSync(join(f.checkout, second), "utf8"),
    "foreign next file",
  );
  assert.deepEqual(
    (await f.runtime.inspectRecovery(getCommand(p))).actions,
    [],
  );
});
