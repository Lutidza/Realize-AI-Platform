/**
 * @file packages/engineering-runtime/test/runtime.test.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Проверяет replay, stale версии, отмену, recovery и границу публичных данных.
 * @see documentation/architecture/engineering-operations.md
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { EngineeringRuntime } from "../src/engineeringRuntime.server.index.ts";
import type { OperationView } from "../src/engineeringRuntime.server.index.ts";
import type { StoredOperation } from "../src/storage/engineeringStorage.index.ts";
import type { RuntimeRecord } from "../src/runtime/EngineeringRuntime.types.ts";
import { runtimeFixture, planCommand, targetId } from "./runtime.fixture.ts";

function applyCommand(view: OperationView) {
  return {
    schemaVersion: 1,
    operationId: view.operationId,
    planId: view.planRef!.planId,
    planHash: view.planRef!.planHash,
    requestId: randomUUID(),
    expectedRevision: view.revision,
  };
}
function getCommand(view: OperationView) {
  return { schemaVersion: 1, operationId: view.operationId };
}
function cleanup(f: ReturnType<typeof runtimeFixture>) {
  try {
    f.store.close();
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
}
const rejects = (code: string) => (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "code" in error &&
  error.code === code;

test("deterministic plan, safe preview and fresh authorization on same-key replay", async () => {
  const f = runtimeFixture();
  try {
    const command = planCommand();
    const first = await f.runtime.plan(command);
    const second = await f.runtime.plan({
      ...command,
      requestId: randomUUID(),
    });
    assert.equal(first.planRef!.planHash, second.planRef!.planHash);
    assert.deepEqual(await f.runtime.plan(command), first);
    const preview = await f.runtime.preview({
      ...getCommand(first),
      planId: first.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.equal(preview.effects.length, 2);
    assert.ok(!JSON.stringify(preview).includes("PRIVATE-CANARY"));
    assert.ok(!JSON.stringify(preview).includes(f.root));
    await assert.rejects(
      f.runtime.plan({ ...command, taskRefs: [randomUUID()] }),
      rejects("CONFLICT"),
    );
    f.control.allowed = false;
    await assert.rejects(f.runtime.plan(command), rejects("FORBIDDEN"));
  } finally {
    cleanup(f);
  }
});

test("apply replay precedes CAS, returns immutable receipt and never repeats primitive", async () => {
  const f = runtimeFixture();
  try {
    const planned = await f.runtime.plan(planCommand());
    const cmd = applyCommand(planned);
    const result = await f.runtime.apply(cmd);
    assert.equal(result.state, "completed");
    assert.equal(result.effectsSummary, "applied");
    assert.equal(result.writeBlock, null);
    assert.equal(f.control.writes, 2);
    assert.deepEqual(await f.runtime.apply(cmd), result);
    assert.equal(f.control.writes, 2);
    await assert.rejects(
      f.runtime.apply({ ...cmd, expectedRevision: result.revision }),
      rejects("CONFLICT"),
    );
    await assert.rejects(
      f.runtime.apply({
        ...cmd,
        requestId: randomUUID(),
        expectedRevision: result.revision,
      }),
      rejects("CONFLICT"),
    );
    const receipt = await f.runtime.receipt(getCommand(result));
    assert.equal(receipt!.id, result.receiptRef);
    receipt!.taskRefs.push("client mutation");
    assert.deepEqual(
      (await f.runtime.receipt(getCommand(result)))!.taskRefs,
      [],
    );
    assert.equal(f.store.listBlockedOperations().length, 0);
  } finally {
    cleanup(f);
  }
});

test("stale input, stale revision and forbidden target rejected before effects", async () => {
  const f = runtimeFixture();
  try {
    await assert.rejects(
      f.runtime.plan({ ...planCommand(), targetId: randomUUID() }),
      rejects("FORBIDDEN"),
    );
    const planned = await f.runtime.plan(planCommand());
    const cmd = applyCommand(planned);
    await assert.rejects(
      f.runtime.apply({ ...cmd, expectedRevision: 999 }),
      rejects("CONFLICT"),
    );
    writeFileSync(f.file, "foreign");
    await assert.rejects(f.runtime.apply(cmd), rejects("CONFLICT"));
    assert.equal(f.control.writes, 0);
  } finally {
    cleanup(f);
  }
});

test("lost effect outcome: durable pending survives reopen; read-only recovery confirms after without duplicate write", async () => {
  let f = runtimeFixture();
  const root = f.root;
  try {
    f.control.failAfterWrite = true;
    const result = await f.runtime.apply(
      applyCommand(await f.runtime.plan(planCommand())),
    );
    assert.equal(result.state, "recovery_required");
    assert.equal(result.effectsSummary, "unknown");
    assert.ok(!JSON.stringify(result).includes("/private/path"));
    f.store.close();
    f = runtimeFixture(root);
    const before = f.store.listEvents().length;
    const p = await f.runtime.inspectRecovery(getCommand(result));
    assert.deepEqual(await f.runtime.inspectRecovery(getCommand(result)), p);
    assert.equal(f.store.listEvents().length, before);
    assert.deepEqual(p.actions, ["resume"]);
    const cmd = {
      ...getCommand(result),
      recoveryPlanId: p.recoveryPlanId,
      recoveryPlanHash: p.recoveryPlanHash,
      requestId: randomUUID(),
      expectedRevision: p.revision,
      action: "resume",
    };
    const recovered = await f.runtime.recover(cmd);
    assert.equal(recovered.state, "completed");
    assert.equal(recovered.attempt, 2);
    assert.equal(f.control.writes, 1);
    assert.deepEqual(await f.runtime.recover(cmd), recovered);
    assert.equal(f.control.writes, 1);
  } finally {
    cleanup(f);
  }
});

test("foreign state blocks recovery and a new request cannot bypass unresolved workspace", async () => {
  const f = runtimeFixture();
  try {
    f.control.failAfterWrite = true;
    const result = await f.runtime.apply(
      applyCommand(await f.runtime.plan(planCommand())),
    );
    const old = await f.runtime.inspectRecovery(getCommand(result));
    writeFileSync(f.file, "foreign");
    const p = await f.runtime.inspectRecovery(getCommand(result));
    assert.deepEqual(p.actions, []);
    await assert.rejects(
      f.runtime.recover({
        ...getCommand(result),
        recoveryPlanId: old.recoveryPlanId,
        recoveryPlanHash: old.recoveryPlanHash,
        expectedRevision: old.revision,
        requestId: randomUUID(),
        action: "resume",
      }),
      rejects("CONFLICT"),
    );
    await assert.rejects(
      f.runtime.plan(planCommand()),
      rejects("RECOVERY_REQUIRED"),
    );
    assert.equal(readFileSync(f.file, "utf8"), "foreign");
  } finally {
    cleanup(f);
  }
});

test("planned cancellation prevents apply; cancellation after one effect remains recoverable partial", async () => {
  const f = runtimeFixture();
  try {
    const planned = await f.runtime.plan(planCommand());
    const cancelled = await f.runtime.cancel({
      ...getCommand(planned),
      expectedRevision: planned.revision,
      requestId: randomUUID(),
      reason: "Не требуется",
    });
    assert.equal(cancelled.state, "cancelled");
    assert.equal(cancelled.writeBlock, null);
    await assert.rejects(
      f.runtime.apply(applyCommand(cancelled)),
      rejects("CONFLICT"),
    );
    const next = await f.runtime.plan(planCommand());
    f.control.onAuthorize = async (a) => {
      if (a.command === "effect" && f.control.writes === 1) {
        f.control.onAuthorize = null;
        const current = await f.runtime.get(getCommand(next));
        await f.runtime.cancel({
          ...getCommand(next),
          expectedRevision: current.revision,
          requestId: randomUUID(),
          reason: "Остановить пакет",
        });
      }
    };
    const partial = await f.runtime.apply(applyCommand(next));
    assert.equal(partial.state, "recovery_required");
    assert.equal(partial.effectsSummary, "partial");
    assert.equal(partial.cancelState, "confirmed");
    assert.equal(partial.writeBlock, "fs_unresolved");
    assert.equal(f.control.writes, 1);
  } finally {
    cleanup(f);
  }
});

test("unknown asynchronous writer remains stop_unconfirmed after cancel and cannot resume", async () => {
  const f = runtimeFixture();
  try {
    f.control.asyncViolation = true;
    const result = await f.runtime.apply(
      applyCommand(await f.runtime.plan(planCommand())),
    );
    assert.equal(result.writeBlock, "writer_unconfirmed");
    const cancelled = await f.runtime.cancel({
      ...getCommand(result),
      expectedRevision: result.revision,
      requestId: randomUUID(),
      reason: "stop",
    });
    assert.equal(cancelled.cancelState, "stop_unconfirmed");
    assert.deepEqual(
      (await f.runtime.inspectRecovery(getCommand(result))).actions,
      [],
    );
  } finally {
    cleanup(f);
  }
});

test("fully confirmed writes followed by stale final snapshot release workspace with applied/failed", async () => {
  const f = runtimeFixture();
  try {
    f.control.count = 1;
    f.control.alterAtSnapshot = 4;
    const result = await f.runtime.apply(
      applyCommand(await f.runtime.plan(planCommand())),
    );
    assert.equal(result.state, "failed");
    assert.equal(result.effectsSummary, "applied");
    assert.equal(result.checksSummary, "stale");
    assert.equal(result.writeBlock, null);
    assert.equal(f.control.writes, 1);
    assert.equal(f.store.listBlockedOperations().length, 0);
  } finally {
    cleanup(f);
  }
});

test("no-op is explicit none; absent adapter and incomplete coverage never claim completed", async () => {
  const f = runtimeFixture();
  try {
    const readOnly = new EngineeringRuntime({
      ...f.options,
      effects: undefined,
    });
    const planned = await readOnly.plan(planCommand());
    await assert.rejects(
      readOnly.apply(applyCommand(planned)),
      rejects("UNSUPPORTED"),
    );
    f.control.complete = false;
    assert.equal((await f.runtime.plan(planCommand())).state, "failed");
    f.control.complete = true;
    f.control.count = 0;
    const noop = await readOnly.apply(
      applyCommand(await readOnly.plan(planCommand())),
    );
    assert.equal(noop.state, "completed");
    assert.equal(noop.effectsSummary, "none");
    assert.equal(f.control.writes, 0);
  } finally {
    cleanup(f);
  }
});

test("preview total diff bounded; cursors bind actor, scope version, epoch and exact plan", async () => {
  const f = runtimeFixture();
  try {
    f.control.count = 3;
    f.control.diff = "x".repeat(64 * 1024);
    const result = await f.runtime.plan(planCommand());
    assert.equal(result.state, "planned");
    const cmd = {
      ...getCommand(result),
      planId: result.planRef!.planId,
      after: null,
      limit: 100,
    };
    const page = await f.runtime.preview(cmd);
    assert.equal(page.effects.length, 2);
    assert.equal(page.hasMore, true);
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 256 * 1024);
    const last = await f.runtime.preview({ ...cmd, after: page.nextCursor });
    assert.equal(last.effects.length, 1);
    f.control.scopeVersion = "scope-2";
    await assert.rejects(f.runtime.preview({ ...cmd, after: page.nextCursor }));
  } finally {
    cleanup(f);
  }
});

test("tampered public projection fails integrity; events are durable, bounded and ACL filtered", async () => {
  const f = runtimeFixture();
  try {
    const result = await f.runtime.plan(planCommand());
    const events = await f.runtime.events({
      schemaVersion: 1,
      targetId,
      after: null,
      limit: 100,
    });
    assert.equal(events.events.length, 2);
    assert.equal(events.coverage.complete, true);
    assert.ok(!JSON.stringify(events).includes(f.store.binding.epoch));
    const raw = structuredClone(
      f.store.getOperation(result.operationId),
    ) as unknown as RuntimeRecord;
    raw.payload.plan!.public.effects[0].diff = "forged preview";
    raw.revision++;
    f.store.transaction((tx) =>
      tx.replaceOperation(raw as unknown as StoredOperation, raw.revision - 1),
    );
    await assert.rejects(
      f.runtime.get(getCommand(result)),
      rejects("RECOVERY_REQUIRED"),
    );
    await assert.rejects(
      f.runtime.events({ schemaVersion: 1, targetId, after: null, limit: 100 }),
      rejects("RECOVERY_REQUIRED"),
    );
  } finally {
    cleanup(f);
  }
});

test("SIGKILL after primitive: new process recovers pending after without repeating primitive", async () => {
  let f = runtimeFixture();
  const root = f.root;
  try {
    f.store.close();
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import {writeFileSync} from 'node:fs';import {runtimeFixture,planCommand} from './packages/engineering-runtime/test/runtime.fixture.ts';const f=runtimeFixture(process.argv[1]);const p=await f.runtime.plan(planCommand());writeFileSync(process.argv[1]+'/operation.json',JSON.stringify(p));f.control.crashAfterWrite=true;await f.runtime.apply({schemaVersion:1,operationId:p.operationId,planId:p.planRef.planId,planHash:p.planRef.planHash,requestId:crypto.randomUUID(),expectedRevision:p.revision});`,
        root,
      ],
      { cwd: process.cwd(), stdio: "ignore" },
    );
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    const [, signal] = await once(child, "exit");
    clearTimeout(timer);
    assert.equal(signal, "SIGKILL");
    f = runtimeFixture(root);
    const saved = JSON.parse(
      readFileSync(join(root, "operation.json"), "utf8"),
    ) as OperationView;
    const p = await f.runtime.inspectRecovery(getCommand(saved));
    assert.equal(p.pending, 0);
    assert.equal(p.writerStopped, true);
    const done = await f.runtime.recover({
      ...getCommand(saved),
      requestId: randomUUID(),
      expectedRevision: p.revision,
      recoveryPlanId: p.recoveryPlanId,
      recoveryPlanHash: p.recoveryPlanHash,
      action: "resume",
    });
    assert.equal(done.state, "completed");
    assert.equal(f.control.writes, 1);
    assert.equal(readFileSync(f.file, "utf8"), "2");
  } finally {
    cleanup(f);
  }
});

test("plan replay rechecks operation-level ACL even when new planning remains permitted", async () => {
  const f = runtimeFixture();
  try {
    const command = planCommand();
    const planned = await f.runtime.plan(command);
    f.control.onAuthorize = async (admission) => {
      if (admission.operationId === planned.operationId)
        throw new Error("revoked operation");
    };
    await assert.rejects(f.runtime.plan(command), rejects("FORBIDDEN"));
    assert.equal(
      (await f.runtime.plan({ ...command, requestId: randomUUID() })).state,
      "planned",
    );
  } finally {
    cleanup(f);
  }
});

test("events reject scope changes mid-page instead of advancing a cursor under new grants", async () => {
  const f = runtimeFixture();
  try {
    await f.runtime.plan(planCommand());
    f.control.onAuthorize = async (admission) => {
      if (admission.command === "get")
        f.control.scopeVersion = "revoked-or-expanded";
    };
    await assert.rejects(
      f.runtime.events({ schemaVersion: 1, targetId, after: null, limit: 100 }),
      rejects("EXPIRED"),
    );
  } finally {
    cleanup(f);
  }
});

test("events byte budget preserves exact continuation without dropping accepted events", async () => {
  const f = runtimeFixture();
  try {
    const planned = await f.runtime.plan(planCommand());
    f.store.transaction((tx) => {
      for (let i = 0; i < 500; i++)
        tx.appendEvent({
          operationId: planned.operationId,
          revision: planned.revision,
          kind: "e".repeat(256),
          at: new Date().toISOString(),
          attempt: 0,
          manifestRef: "a".repeat(64),
        });
    });
    const first = await f.runtime.events({
      schemaVersion: 1,
      targetId,
      after: null,
      limit: 500,
    });
    assert.ok(Buffer.byteLength(JSON.stringify(first)) <= 256 * 1024);
    assert.equal(first.hasMore, true);
    const second = await f.runtime.events({
      schemaVersion: 1,
      targetId,
      after: first.nextCursor,
      limit: 500,
    });
    assert.equal(first.events.length + second.events.length, 502);
    assert.equal(
      new Set([...first.events, ...second.events].map((e) => e.id)).size,
      502,
    );
  } finally {
    cleanup(f);
  }
});
