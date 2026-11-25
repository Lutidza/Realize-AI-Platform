/**
 * @file .ai/tools/worker-assignment/test/checkpoints/checkpointIntegrity.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет целостность чтений и конкуренцию владельцев попытки в отдельной PostgreSQL.
 * @see documentation/specifications/task-management/execution/article-audit-storage-pilot.md
 */
import assert from "node:assert/strict";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createRepositoryReadPolicy } from "../../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import type { SingleReadTransport } from "../../src/exchange/SingleRead.types";
import { advanceAuditCheckpoint } from "../../src/checkpoints/advanceAuditCheckpoint.service";
import { confirmAuditResponse } from "../../src/checkpoints/confirmAuditResponse.service";
import type { CheckpointSnapshot } from "../../src/checkpoints/Checkpoint.types";
import { adjacent, view } from "../articleAudit.fixture";
import {
  readCheckpointJournal,
  runCheckpointProcess,
  setupCheckpointPilot,
} from "./checkpointPilot.fixture";

function call(id: string, path: string) {
  return {
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          tool_calls: [
            {
              id,
              type: "function",
              function: {
                name: "repo_read_file",
                arguments: JSON.stringify({ path, startLine: 1, lineCount: 1 }),
              },
            },
          ],
        },
      },
    ],
  };
}

function report() {
  return {
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: "Сохранённый отчёт имитатора." },
      },
    ],
  };
}

test("4. Целостность: повтор подтверждения, подмена вызова, соседний путь, изменение файла и отзыв права", async (t) => {
  for (const scenario of [
    "replay",
    "foreign-call",
    "adjacent",
    "changed-file",
    "revoked",
  ] as const) {
    await t.test(scenario, async (t) => {
      const f = await setupCheckpointPilot(t);
      const lease = await f.store.claim(
        f.attemptId,
        f.initial.revision,
        "integrity",
        60_000,
      );
      const responses = [
        call("first", view),
        call("second", scenario === "adjacent" ? adjacent : view),
        report(),
      ];
      const exchanges: {
        sending: CheckpointSnapshot;
        request: Parameters<SingleReadTransport["send"]>[0];
        reply: Awaited<ReturnType<SingleReadTransport["send"]>>;
      }[] = [];
      const transport: SingleReadTransport = {
        async send(request) {
          const sending = await f.store.get(f.attemptId);
          const reply = {
            attemptId: request.attemptId,
            requestId: request.requestId,
            body: responses[exchanges.length],
          };
          exchanges.push({ sending, request, reply });
          return reply;
        },
      };
      const step = (state: CheckpointSnapshot) =>
        advanceAuditCheckpoint(
          f.store,
          state,
          lease,
          f.task,
          f.policy,
          transport,
        );
      const first = await step(f.initial);
      const pending = await step(first);
      assert(pending.state.status === "pending");
      const original = await f.store.receipts(f.attemptId);
      assert.equal(original.length, 1);
      assert.equal(original[0].operation.receipt?.path, view);
      assert.equal(original[0].operation.key.toolCallId, "first");
      assert.equal(exchanges.length, 2);
      if (scenario === "replay") {
        const { sending, reply } = exchanges[1];
        const replay = () =>
          confirmAuditResponse(f.store, sending, lease, reply);
        assert.deepEqual(await replay(), pending);
        await assert.rejects(
          confirmAuditResponse(f.store, sending, lease, {
            ...reply,
            body: report(),
          }),
          /checkpoint_conflict/,
        );
        assert.deepEqual(await f.store.get(f.attemptId), pending);
      } else if (scenario === "adjacent") {
        const received = await step(pending);
        assert.equal(received.state.status, "received");
        const confirmed = await f.store.receipts(f.attemptId);
        assert.deepEqual(
          confirmed.filter((read) => read.operation.receipt),
          original,
        );
        assert.equal(confirmed.length, 2);
        assert.equal(confirmed[1].operation.code, "FORBIDDEN");
        assert.equal(confirmed[1].operation.receipt, null);
        const tool = JSON.parse(exchanges[2].request.body).messages.at(-1);
        assert.deepEqual(tool, {
          role: "tool",
          tool_call_id: "second",
          content: JSON.stringify({ code: "FORBIDDEN" }),
        });
        return;
      } else {
        if (scenario === "changed-file")
          await appendFile(
            join(f.root, view),
            "\n// Обновлено после первого чтения\n",
          );
        const policy =
          scenario === "revoked"
            ? await createRepositoryReadPolicy(f.root, false)
            : f.policy;
        const key =
          scenario === "foreign-call"
            ? { ...pending.state.pending.key, toolCallId: "unrelated" }
            : pending.state.pending.key;
        const blocked = await advanceAuditCheckpoint(
          f.store,
          pending,
          lease,
          f.task,
          policy,
          transport,
          key,
        );
        assert(blocked.state.status === "blocked");
        const reasons = {
          "foreign-call": "tool_call_mismatch",
          revoked: "FORBIDDEN",
          "changed-file": "CONFLICT",
        };
        assert.equal(blocked.state.reason, reasons[scenario]);
        assert.deepEqual(await f.store.get(f.attemptId), blocked);
      }
      assert.equal(exchanges.length, 2);
      assert.deepEqual(await f.store.receipts(f.attemptId), original);
    });
  }
});

test("5. Два процесса претендуют на ревизию, а подтверждает только действующий владелец", async (t) => {
  const f = await setupCheckpointPilot(t);
  const results = await Promise.all(
    ["runner-A", "runner-B"].map((ownerId) =>
      runCheckpointProcess(f, "claim-step", {
        revision: f.initial.revision,
        ownerId,
      }),
    ),
  );
  assert.equal(new Set(results.map((result) => result.pid)).size, 2);
  const winner = results.filter((result) => result.status === "pending");
  const rejected = results.filter(
    (result) => result.error === "checkpoint_lease_unavailable",
  );
  assert.equal(winner.length, 1, JSON.stringify(results));
  assert.equal(rejected.length, 1, JSON.stringify(results));
  const sent = await readCheckpointJournal(f);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].pid, winner[0].pid);
  const current = await f.store.get(f.attemptId);
  assert.equal(current.revision, f.initial.revision + 2);
  assert(current.state.status === "pending");
  assert.equal(current.state.pending.key.requestId, sent[0].requestId);
  assert.deepEqual(await f.store.receipts(f.attemptId), []);

  // Ответ остаётся у имитатора до фактического истечения lease, которое определяют часы БД.
  const former = await f.store.claim(
    f.attemptId,
    current.revision,
    "former-owner",
    3_000,
  );
  const witnessed: {
    sending: CheckpointSnapshot;
    reply: Awaited<ReturnType<SingleReadTransport["send"]>>;
  }[] = [];
  const transport: SingleReadTransport = {
    async send(request) {
      const sending = await f.store.get(f.attemptId);
      const reply = {
        attemptId: request.attemptId,
        requestId: request.requestId,
        body: report(),
      };
      witnessed.push({ sending, reply });
      await f.pool.query(
        "SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM expires_at - clock_timestamp()))::float8 + 0.01) FROM audit_checkpoint.attempts WHERE attempt_id = $1",
        [f.attemptId],
      );
      return reply;
    },
  };
  await assert.rejects(
    advanceAuditCheckpoint(
      f.store,
      current,
      former,
      f.task,
      f.policy,
      transport,
    ),
    /checkpoint_lease_lost/,
  );
  assert.equal(witnessed.length, 1);
  const [{ sending, reply }] = witnessed;
  assert(sending.state.status === "sending");
  assert.equal(sending.state.intent.requestId, reply.requestId);
  assert.deepEqual(await f.store.get(f.attemptId), sending);
  const owner = await f.store.claim(
    f.attemptId,
    sending.revision,
    "new-owner",
    60_000,
  );
  assert(BigInt(owner.fence) > BigInt(former.fence));
  await assert.rejects(
    confirmAuditResponse(f.store, sending, former, reply),
    /checkpoint_lease_lost/,
  );
  assert.deepEqual(await f.store.receipts(f.attemptId), []);
  const received = await confirmAuditResponse(f.store, sending, owner, reply);
  assert.equal(received.state.status, "received");
  assert.equal((await f.store.receipts(f.attemptId)).length, 1);
  await f.store.release(owner);
  const reopened = await f.store.get(f.attemptId);
  const finalOwner = await f.store.claim(
    f.attemptId,
    reopened.revision,
    "after-received",
    60_000,
  );
  assert.deepEqual(
    await advanceAuditCheckpoint(
      f.store,
      reopened,
      finalOwner,
      f.task,
      f.policy,
      transport,
    ),
    received,
  );
  assert.equal(witnessed.length, 1);
});
