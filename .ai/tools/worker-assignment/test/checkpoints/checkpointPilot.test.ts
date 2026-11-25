/**
 * @file .ai/tools/worker-assignment/test/checkpoints/checkpointPilot.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет реальный перезапуск, состав передачи ревьюеру и неизвестный исход отправки в PostgreSQL.
 * @see documentation/specifications/task-management/execution/article-audit-storage-pilot.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { prepareAuditHandoff } from "../../src/checkpoints/prepareAuditHandoff.service";
import { view } from "../articleAudit.fixture";
import {
  setupCheckpointPilot,
  runCheckpointProcess,
  readCheckpointJournal,
} from "./checkpointPilot.fixture";
import "./checkpointIntegrity.test";

test("1. Два чтения в одной попытке через остановку и новый процесс", async (t) => {
  const f = await setupCheckpointPilot(t);
  const first = await runCheckpointProcess(f, "first-read");
  assert.equal(first.status, "pending");
  const pending = await f.store.get(f.attemptId);
  assert(pending.state.status === "pending");
  assert.equal(pending.state.pending.key.toolCallId, "article-call-2");
  assert.equal((await f.store.receipts(f.attemptId)).length, 1);
  const next = await runCheckpointProcess(f, "step");
  assert.notEqual(next.pid, first.pid);
  assert.equal(next.status, "received");
  const events = await readCheckpointJournal(f);
  assert.deepEqual(
    events.map((e) => e.pid),
    [first.pid, first.pid, next.pid],
  );
  assert.equal(new Set(events.map((e) => e.attemptId)).size, 1);
  assert.equal(events[0].attemptId, f.attemptId);
  assert.equal(new Set(events.map((e) => e.requestId)).size, 3);
  const bodies = events.map((e) => JSON.parse(e.body));
  assert.deepEqual(
    bodies.map((body) => body.messages.length),
    [1, 3, 5],
  );
  assert.deepEqual(bodies[2].messages.slice(0, 3), bodies[1].messages);
  const lines = (await readFile(join(f.root, view), "utf8")).match(
    /[^\n]*\n|[^\n]+$/g,
  )!;
  const receipts = await f.store.receipts(f.attemptId);
  assert.equal(receipts.length, 2);
  for (const [index, start] of [20, 60].entries()) {
    const pair = receipts[index],
      msg = bodies[index + 1].messages.at(-1);
    assert.equal(pair.operation.key.requestId, events[index].requestId);
    assert.equal(pair.requestId, events[index + 1].requestId);
    assert.equal(msg.tool_call_id, pair.operation.key.toolCallId);
    assert.deepEqual(JSON.parse(msg.content), {
      ...pair.operation.receipt,
      text: lines.slice(start - 1, start + 19).join(""),
    });
  }
  t.diagnostic("1 attemptId, 3 requestId, 2 подтверждённых чтения, 1 received");
});

test("2. Воспроизводимая передача отчёта и фактического покрытия 12 файлов", async (t) => {
  const f = await setupCheckpointPilot(t);
  assert.equal((await runCheckpointProcess(f, "first-read")).status, "pending");
  assert.equal((await runCheckpointProcess(f, "step")).status, "received");
  const restore = async () =>
    prepareAuditHandoff(
      await f.store.get(f.attemptId),
      await f.store.receipts(f.attemptId),
    );
  const handoff = await restore();
  assert.deepEqual(handoff, await restore());
  assert.equal(handoff.attemptId, f.attemptId);
  assert.deepEqual(handoff.task, f.task);
  assert.equal(handoff.report, "Отчёт имитатора о двух диапазонах формы.\n");
  assert.equal(
    handoff.reportSha256,
    createHash("sha256").update(handoff.report).digest("hex"),
  );
  assert.deepEqual(
    handoff.coverage.map((file) => file.path),
    Object.keys(f.lock.files)
      .filter((path) => path.startsWith("src/"))
      .sort(),
  );
  const covered = handoff.coverage.filter((file) => file.status === "read");
  assert.equal(covered.length, 1);
  assert.equal(covered[0].path, view);
  assert.equal(covered[0].sha256, f.lock.files[view]);
  assert.deepEqual(covered[0].ranges, [
    { startLine: 20, endLine: 39 },
    { startLine: 60, endLine: 79 },
  ]);
  assert.deepEqual(
    covered[0].receipts.map((r) => r.toolCallId),
    ["article-call-1", "article-call-2"],
  );
  assert(
    handoff.coverage
      .filter((file) => file.status === "unread")
      .every((file) => !file.ranges.length && !file.receipts.length),
  );
  const snapshot = await f.store.get(f.attemptId);
  const originals = await f.store.receipts(f.attemptId);
  const changedRange = structuredClone(originals);
  const interval = changedRange[0].operation.receipt;
  assert(interval);
  interval.startLine += 1;
  assert.throws(
    () => prepareAuditHandoff(snapshot, changedRange),
    /audit_receipt_mismatch/,
  );
  const changedRequest = structuredClone(originals);
  changedRequest[0].requestId = "foreign-destination-request";
  assert.throws(
    () => prepareAuditHandoff(snapshot, changedRequest),
    /audit_receipt_mismatch/,
  );
  t.diagnostic(
    "Карта: 12 файлов, 11 без чтения, 2 диапазона с квитанциями. SHA-256 отчёта: " +
      handoff.reportSha256,
  );
});

test("3. Падение после отправки: delivery_unknown, recovery_required и ноль повторов", async (t) => {
  const f = await setupCheckpointPilot(t);
  assert.equal((await runCheckpointProcess(f, "first-read")).status, "pending");
  const crashed = await runCheckpointProcess(f, "crash");
  assert.equal(crashed.status, "killed");
  const interrupted = await f.store.get(f.attemptId);
  assert(interrupted.state.status === "sending");
  const events = await readCheckpointJournal(f);
  assert.equal(events.length, 3);
  assert.equal(interrupted.state.intent.requestId, events[2].requestId);
  assert.equal(
    interrupted.state.intent.bodySha256,
    createHash("sha256").update(events[2].body).digest("hex"),
  );
  // После аварии право записи освобождается по часам PostgreSQL.
  const expiry = await f.pool.query(
    "SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at-clock_timestamp()))*1000))::int AS wait_ms FROM audit_checkpoint.attempts WHERE attempt_id=$1",
    [f.attemptId],
  );
  await delay(expiry.rows[0].wait_ms + 1);
  assert.equal(
    (await runCheckpointProcess(f, "step")).status,
    "delivery_unknown",
  );
  const recovered = await f.store.get(f.attemptId);
  assert(recovered.state.status === "delivery_unknown");
  assert.equal(recovered.state.taskState, "recovery_required");
  assert.equal(recovered.state.requestId, events[2].requestId);
  assert.equal(
    (await runCheckpointProcess(f, "step")).status,
    "delivery_unknown",
  );
  assert.deepEqual(await readCheckpointJournal(f), events);
  const receipts = await f.store.receipts(f.attemptId);
  assert.deepEqual(
    receipts.map((r) => r.operation.key.toolCallId),
    ["article-call-1"],
  );
  t.diagnostic(
    "После SIGKILL осталась 1 квитанция, отправок при восстановлении: 0",
  );
});
