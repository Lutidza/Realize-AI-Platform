/**
 * @file .ai/tools/engineering/test/filesystemIntegration.test.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Проверяет создание authored source/template, реальные namespace guards и durable recovery после SIGKILL.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import {
  aiPath,
  applyCommand,
  contentCommand,
  filesystemFixture,
  getCommand,
  hasCode,
  planCommand,
  policySource,
  source,
  sourcePath,
  template,
} from "./filesystemIntegration.fixture.ts";
let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(join(homedir(), ".cache", "engineering-fs-native-"));
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
  const f = filesystemFixture(native);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
async function sourcePlan(
  f: ReturnType<typeof filesystemFixture>,
  path = sourcePath,
) {
  const c = await f.runtime.prepareContent(contentCommand(source(path)));
  return f.runtime.plan(
    planCommand([
      {
        kind: "create_directory",
        path: "src/nested",
        purpose: "Вычисления",
        folderPolicyId: "source",
      },
      {
        kind: "create_file",
        path,
        artifactKind: "source.util",
        contentRef: c.contentRef,
      },
    ]),
  );
}

test("source and AI template are created with exact bytes, safe preview, per-path hashes and replay", async (t) => {
  const f = fixture(t),
    s = await f.runtime.prepareContent(contentCommand(source())),
    a = await f.runtime.prepareContent(contentCommand(template()));
  const command = planCommand([
    {
      kind: "create_directory",
      path: "src/nested",
      purpose: "Вычисления",
      folderPolicyId: "source",
    },
    {
      kind: "create_file",
      path: sourcePath,
      artifactKind: "source.util",
      contentRef: s.contentRef,
    },
    {
      kind: "create_directory",
      path: ".ai/templates/engineering",
      purpose: "Инженерные шаблоны",
      folderPolicyId: "templates",
    },
    {
      kind: "create_file",
      path: aiPath,
      artifactKind: "ai.template",
      contentRef: a.contentRef,
    },
  ]);
  const planned = await f.runtime.plan(command);
  assert.equal(planned.state, "planned", JSON.stringify(planned));
  assert.deepEqual(await f.runtime.plan(command), planned);
  const preview = await f.runtime.preview({
    ...getCommand(planned),
    planId: planned.planRef!.planId,
    after: null,
    limit: 100,
  });
  assert.equal(preview.effects.length, 4);
  assert.match(preview.effects[1].diff!, /@file src\/nested/);
  assert.ok(!JSON.stringify(preview).includes(f.root));
  const apply = applyCommand(planned),
    completed = await f.runtime.apply(apply);
  assert.equal(completed.state, "completed", JSON.stringify(completed));
  assert.equal(f.control.writes, 4);
  assert.deepEqual(await f.runtime.apply(apply), completed);
  assert.equal(f.control.writes, 4);
  assert.deepEqual(
    readFileSync(join(f.checkout, sourcePath)),
    Buffer.from(source()),
  );
  assert.deepEqual(
    readFileSync(join(f.checkout, aiPath)),
    Buffer.from(template()),
  );
  const receipt = await f.runtime.receipt(getCommand(completed));
  assert.deepEqual(receipt!.createdArtifacts, [
    { path: "src/nested", kind: "directory", sha256: null },
    { path: sourcePath, kind: "file", sha256: sha256Bytes(source()) },
    { path: ".ai/templates/engineering", kind: "directory", sha256: null },
    { path: aiPath, kind: "file", sha256: sha256Bytes(template()) },
  ]);
  assert.equal(receipt!.checksSummary, "not_run");
});
test("content replay, different body, hash mismatch, expiry and revoked ACL are enforced", async (t) => {
  const f = fixture(t),
    cmd = contentCommand(source()),
    view = await f.runtime.prepareContent(cmd);
  assert.deepEqual(await f.runtime.prepareContent(cmd), view);
  await assert.rejects(
    f.runtime.prepareContent({ ...cmd, mediaType: "application/json" }),
    hasCode("CONFLICT"),
  );
  await assert.rejects(
    f.runtime.prepareContent({
      ...cmd,
      requestId: randomUUID(),
      sha256: "0".repeat(64),
    }),
    hasCode("INVALID_INPUT"),
  );
  const foreign = filesystemFixture(native, f.root, {
    ...f.options.principal,
    actorId: "2",
  });
  t.after(() => foreign.close());
  const denied = await foreign.runtime.plan(
    planCommand([
      {
        kind: "create_file",
        path: "src/calculateTotal.util.ts",
        artifactKind: "source.util",
        contentRef: view.contentRef,
      },
    ]),
  );
  assert.equal(denied.error?.code, "FORBIDDEN");
  f.control.allowed = false;
  await assert.rejects(f.runtime.prepareContent(cmd), hasCode("FORBIDDEN"));
  f.control.allowed = true;
  f.control.now += 31 * 60_000;
  await assert.rejects(f.runtime.prepareContent(cmd), hasCode("EXPIRED"));
});
test("existing targets and case collisions fail before checkout writes", async (t) => {
  const f = fixture(t);
  mkdirSync(join(f.checkout, "src/Nested"));
  const p = await sourcePlan(f);
  assert.equal(p.state, "failed");
  assert.equal(p.error?.code, "CONFLICT");
  assert.equal(f.control.writes, 0);
  rmSync(join(f.checkout, "src/Nested"), { recursive: true });
  const okay = await sourcePlan(f);
  writeFileSync(join(f.checkout, "src/foreign.txt"), "keep");
  await assert.rejects(
    f.runtime.apply(applyCommand(okay)),
    hasCode("CONFLICT"),
  );
  assert.equal(
    readFileSync(join(f.checkout, "src/foreign.txt"), "utf8"),
    "keep",
  );
  assert.ok(!existsSync(join(f.checkout, "src/nested")));
});
test("missing parents, traversal, unsupported kind and wrong owner fail closed", async (t) => {
  const f = fixture(t),
    c = await f.runtime.prepareContent(contentCommand(source()));
  const missing = await f.runtime.plan(
    planCommand([
      {
        kind: "create_file",
        path: sourcePath,
        artifactKind: "source.util",
        contentRef: c.contentRef,
      },
    ]),
  );
  assert.equal(missing.error?.code, "INVALID_INPUT");
  await assert.rejects(
    f.runtime.plan(
      planCommand([
        {
          kind: "create_file",
          path: "../escape.util.ts",
          artifactKind: "source.util",
          contentRef: c.contentRef,
        },
      ]),
    ),
    hasCode("INVALID_INPUT"),
  );
  const unsupported = await f.runtime.plan(
    planCommand([
      {
        kind: "create_file",
        path: sourcePath,
        artifactKind: "ai.rule",
        contentRef: c.contentRef,
      },
    ]),
  );
  assert.equal(unsupported.error?.code, "UNSUPPORTED");
  const denied = await f.runtime.plan(
    planCommand([
      {
        kind: "create_directory",
        path: ".codex/other",
        purpose: "Правки",
        folderPolicyId: "source",
      },
    ]),
  );
  assert.equal(denied.error?.code, "UNSUPPORTED");
  assert.equal(f.control.writes, 0);
});
test("symlink and hardlink inputs are rejected without following targets", async (t) => {
  const f = fixture(t),
    outside = join(f.root, "outside");
  mkdirSync(outside);
  symlinkSync(outside, join(f.checkout, "src/nested"));
  const linked = await sourcePlan(f);
  assert.equal(linked.error?.code, "UNSUPPORTED");
  assert.deepEqual(readdirSync(outside), []);
  rmSync(join(f.checkout, "src/nested"));
  linkSync(join(f.checkout, policySource), join(f.checkout, "extra-hardlink"));
  const hardlinked = await sourcePlan(f);
  assert.equal(hardlinked.error?.code, "UNSUPPORTED");
  assert.equal(f.control.writes, 0);
});
test("changed policy and modified staging invalidate a frozen plan", async (t) => {
  const f = fixture(t),
    p = await sourcePlan(f);
  assert.equal(p.state, "planned", JSON.stringify(p));
  writeFileSync(join(f.checkout, policySource), "changed");
  await assert.rejects(f.runtime.apply(applyCommand(p)), hasCode("CONFLICT"));
  assert.equal(f.control.writes, 0);
  const g = fixture(t),
    q = await sourcePlan(g);
  const stage = readdirSync(join(g.root, "files")).find(
    (n) => n !== "content",
  )!;
  writeFileSync(join(g.root, "files", stage, "1"), "tampered");
  await assert.rejects(g.runtime.apply(applyCommand(q)), hasCode("CONFLICT"));
  assert.ok(!existsSync(join(g.checkout, sourcePath)));
});
test("lost outcome is recovered after reopen without repeating a published inode", async () => {
  let f = filesystemFixture(native);
  const root = f.root;
  try {
    const p = await sourcePlan(f);
    f.control.failAfterWrite = true;
    const interrupted = await f.runtime.apply(applyCommand(p));
    assert.equal(interrupted.state, "recovery_required");
    const inode = statSync(join(f.checkout, "src/nested")).ino;
    f.close();
    f = filesystemFixture(native, root);
    const r = await f.runtime.inspectRecovery(getCommand(interrupted));
    assert.deepEqual(r.actions, ["resume"]);
    const recoveryCommand = {
      ...getCommand(interrupted),
      recoveryPlanId: r.recoveryPlanId,
      recoveryPlanHash: r.recoveryPlanHash,
      requestId: randomUUID(),
      expectedRevision: r.revision,
      action: "resume",
    };
    f.control.failDurability = true;
    await assert.rejects(
      f.runtime.recover(recoveryCommand),
      hasCode("INTERNAL_ERROR"),
    );
    assert.equal(f.control.writes, 0);
    assert.equal(
      (await f.runtime.get(getCommand(interrupted))).state,
      "recovery_required",
    );
    f.control.failDurability = false;
    const result = await f.runtime.recover(recoveryCommand);
    assert.equal(result.state, "completed", JSON.stringify(result));
    assert.equal(statSync(join(f.checkout, "src/nested")).ino, inode);
    assert.equal(f.control.writes, 1);
    assert.equal(f.control.confirmations, 2);
  } finally {
    f.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("SIGKILL after native rename leaves durable pending and restart confirms exact inode", async () => {
  let f = filesystemFixture(native);
  const root = f.root;
  try {
    const p = await sourcePlan(f),
      command = applyCommand(p);
    const input = join(root, "worker.json");
    writeFileSync(input, JSON.stringify({ native, root, command }), {
      mode: 0o600,
    });
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
      diagnostic += String(chunk).slice(0, 2048);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
    const [code, signal] = await once(child, "exit");
    clearTimeout(timer);
    assert.equal(code, null, diagnostic);
    assert.equal(signal, "SIGKILL", diagnostic);
    const inode = statSync(join(root, "checkout/src/nested")).ino;
    f = filesystemFixture(native, root);
    const r = await f.runtime.inspectRecovery(getCommand(p));
    assert.deepEqual(r.actions, ["resume"]);
    const done = await f.runtime.recover({
      ...getCommand(p),
      recoveryPlanId: r.recoveryPlanId,
      recoveryPlanHash: r.recoveryPlanHash,
      expectedRevision: r.revision,
      requestId: randomUUID(),
      action: "resume",
    });
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(statSync(join(f.checkout, "src/nested")).ino, inode);
    assert.equal(f.control.writes, 1);
  } finally {
    f.close();
    rmSync(root, { recursive: true, force: true });
  }
});
