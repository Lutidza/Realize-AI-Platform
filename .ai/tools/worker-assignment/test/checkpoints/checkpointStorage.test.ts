/**
 * @file .ai/tools/worker-assignment/test/checkpoints/checkpointStorage.test.ts
 * @version 1.0.5
 * @date 2026-11-26
 * @description Проверяет реальный перезапуск, состав передачи ревьюеру и неизвестный исход отправки в PostgreSQL.
 * @see documentation/specifications/task-management/execution/checkpoint-storage.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { prepareAuditHandoff } from "../../src/checkpoints/prepareAuditHandoff.service";
import {
  setupCheckpointStorage,
  runCheckpointProcess,
  readCheckpointJournal,
} from "./checkpointStorage.fixture";
import "./checkpointIntegrity.test";
import { sampleCheckpointAudit } from "./sampleCheckpointAudit.fixture";

test("1. Два чтения в одной попытке через остановку и новый процесс", async (t) => {
  const audit = sampleCheckpointAudit();
  const { reads } = audit.simulator;
  const f = await setupCheckpointStorage(t, audit);
  const first = await runCheckpointProcess(f, "first-read");
  assert.equal(first.status, "pending");
  const pending = await f.store.get(f.attemptId);
  assert(pending.state.status === "pending");
  assert.equal(pending.state.pending.key.toolCallId, reads[1].callId);
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
  const receipts = await f.store.receipts(f.attemptId);
  assert.equal(receipts.length, reads.length);
  for (const [index, read] of reads.entries()) {
    const text = await readFile(join(f.root, read.path), "utf8");
    const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    const offset = read.startLine - 1;
    const pair = receipts[index],
      msg = bodies[index + 1].messages.at(-1);
    assert.equal(pair.operation.key.requestId, events[index].requestId);
    assert.equal(pair.requestId, events[index + 1].requestId);
    assert.equal(pair.operation.key.toolCallId, read.callId);
    assert.equal(pair.operation.receipt?.path, read.path);
    assert.equal(msg.tool_call_id, read.callId);
    assert.deepEqual(JSON.parse(msg.content), {
      ...pair.operation.receipt,
      text: lines.slice(offset, offset + read.lineCount).join(""),
    });
  }
  t.diagnostic(
    `Отправок ${events.length}, подтверждённых чтений ${receipts.length}.`,
  );
});

test("2. Воспроизводимая передача отчёта и фактического покрытия файлов назначения", async (t) => {
  const path = "src/module/entry.ts";
  const audit = sampleCheckpointAudit(
    {
      [path]:
        "// начало\n// первое чтение\n// пропуск\n// второе чтение\n// конец\n",
    },
    [
      { path, startLine: 2, lineCount: 1 },
      { path, startLine: 4, lineCount: 2 },
    ],
  );
  const { reads, report } = audit.simulator;
  const f = await setupCheckpointStorage(t, audit);
  assert.equal((await runCheckpointProcess(f, "first-read")).status, "pending");
  assert.equal((await runCheckpointProcess(f, "step")).status, "received");
  const restore = async () =>
    prepareAuditHandoff(
      await f.store.get(f.attemptId),
      await f.store.receipts(f.attemptId),
      f.result.context,
    );
  const handoff = await restore();
  assert.deepEqual(handoff, await restore());
  assert.equal(handoff.attemptId, f.attemptId);
  assert.deepEqual(handoff.task, f.task);
  assert.equal(handoff.report, report);
  assert.equal(
    handoff.reportSha256,
    createHash("sha256").update(report).digest("hex"),
  );
  assert.deepEqual(
    handoff.coverage.map((file) => file.path),
    Object.keys(f.result.context.scopePins).sort(),
  );
  const covered = handoff.coverage.filter((file) => file.status === "read");
  assert.deepEqual(
    covered.map((file) => file.path),
    [...new Set(reads.map((read) => read.path))].sort(),
  );
  for (const file of handoff.coverage) {
    const expected = reads
      .filter((read) => read.path === file.path)
      .sort((a, b) => a.startLine - b.startLine);
    assert.equal(file.sha256, f.result.context.scopePins[file.path]);
    assert.deepEqual(
      file.receipts.map((r) => r.toolCallId),
      expected.map((read) => read.callId),
    );
    assert.deepEqual(
      file.ranges,
      expected.map(({ startLine, lineCount }) => ({
        startLine,
        endLine: startLine + lineCount - 1,
      })),
    );
  }
  const snapshot = await f.store.get(f.attemptId);
  const originals = await f.store.receipts(f.attemptId);
  const changedRange = structuredClone(originals);
  const interval = changedRange[0].operation.receipt;
  assert(interval);
  interval.startLine += 1;
  assert.throws(
    () => prepareAuditHandoff(snapshot, changedRange, f.result.context),
    /audit_receipt_mismatch/,
  );
  const changedRequest = structuredClone(originals);
  changedRequest[0].requestId = "foreign-destination-request";
  assert.throws(
    () => prepareAuditHandoff(snapshot, changedRequest, f.result.context),
    /audit_receipt_mismatch/,
  );
  t.diagnostic(
    `В карте ${handoff.coverage.length} файлов, из них ${covered.length} прочитано. Подтверждённых чтений ${originals.length}. SHA-256 ${handoff.reportSha256}.`,
  );
});

test("3. Падение после отправки: delivery_unknown, recovery_required и ноль повторов", async (t) => {
  const audit = sampleCheckpointAudit();
  const f = await setupCheckpointStorage(t, audit);
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
  const afterRecovery = await readCheckpointJournal(f);
  assert.deepEqual(afterRecovery, events);
  const receipts = await f.store.receipts(f.attemptId);
  assert.deepEqual(
    receipts.map((r) => r.operation.key.toolCallId),
    [audit.simulator.reads[0].callId],
  );
  t.diagnostic(
    `Квитанций после SIGKILL ${receipts.length}, новых отправок при восстановлении ${afterRecovery.length - events.length}.`,
  );
});
