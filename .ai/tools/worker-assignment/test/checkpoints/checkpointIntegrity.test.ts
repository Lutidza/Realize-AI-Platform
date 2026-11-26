/**
 * @file .ai/tools/worker-assignment/test/checkpoints/checkpointIntegrity.test.ts
 * @version 1.0.5
 * @date 2026-11-26
 * @description Проверяет пути и хеши временного назначения, а в PostgreSQL — сохранение чтений и права владельца попытки.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import type { SingleReadTransport } from "../../src/exchange/SingleRead.types";
import { advanceAuditCheckpoint } from "../../src/checkpoints/advanceAuditCheckpoint.service";
import { confirmAuditResponse } from "../../src/checkpoints/confirmAuditResponse.service";
import { createAuditCheckpointState } from "../../src/checkpoints/createAuditCheckpointState.service";
import { prepareCheckpointRequest } from "../../src/checkpoints/prepareCheckpointRequest.service";
import type { CheckpointSnapshot } from "../../src/checkpoints/Checkpoint.types";
import { sampleCheckpointAudit } from "./sampleCheckpointAudit.fixture";
import { checkpointSimulatorResponse } from "./checkpointSimulatorResponse.fixture";
import {
  readCheckpointJournal,
  runCheckpointProcess,
  setupCheckpointStorage,
} from "./checkpointStorage.fixture";

const entryPath = "src/module/entry.ts";
const sharedPath = "src/shared/entry.ts";
const adjacent = "src/module/draft.ts";

function checkpointAssignment(paths: string[]) {
  return sampleCheckpointAudit(
    Object.fromEntries(paths.map((path) => [path, `// ${path}\n`])),
  );
}

test("4. Целостность контрольной точки и файлов выбранного назначения", async (t) => {
  for (const paths of [[entryPath], [entryPath, sharedPath]]) {
    const audit = checkpointAssignment(paths);
    const { policy, lock, lockPath, contextId, model, root } =
      await audit.prepareContext(t);
    const state = await createAuditCheckpointState(
      policy,
      { lockPath, contextId, model },
      audit.task,
    );
    assert(state.status === "ready");
    assert.deepEqual(
      state.identity.scopePins,
      Object.fromEntries(paths.map((path) => [path, lock.files[path]])),
    );
    const prepare = (checkpoint: typeof state) =>
      prepareCheckpointRequest(policy, audit.attemptId, checkpoint);
    const { request, intent } = await prepare(state);
    assert.equal(intent.requestId, request.id);
    assert.equal(
      intent.bodySha256,
      createHash("sha256").update(request.body).digest("hex"),
    );

    const lastPath = paths[paths.length - 1];
    const substituted = structuredClone(state);
    substituted.identity.scopePins[lastPath] = lock.manifestSha256;
    await assert.rejects(prepare(substituted), { message: "context_mismatch" });
    delete substituted.identity.scopePins[lastPath];
    substituted.identity.scopePins[adjacent] = lock.files[lastPath];
    await assert.rejects(prepare(substituted), { message: "context_mismatch" });
    await appendFile(join(root, lastPath), "// новое содержимое\n");
    await assert.rejects(prepare(state), { message: "CONFLICT" });
  }

  for (const scenario of [
    "replay",
    "foreign-call",
    "adjacent",
    "changed-file",
    "revoked",
  ] as const) {
    await t.test("PostgreSQL — " + scenario, async (t) => {
      const audit = checkpointAssignment([entryPath, sharedPath]);
      const [firstRead, secondRead] = audit.simulator.reads;
      const f = await setupCheckpointStorage(t, audit);
      if (scenario === "adjacent")
        await writeFile(join(f.root, adjacent), "// соседний файл\n");
      const lease = await f.store.claim(
        f.attemptId,
        f.initial.revision,
        "integrity",
        60_000,
      );
      const simulator = {
        ...audit.simulator,
        reads: [
          firstRead,
          scenario === "adjacent"
            ? { ...secondRead, path: adjacent }
            : secondRead,
        ],
      };
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
            body: checkpointSimulatorResponse(request.body, simulator),
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
      assert.equal(original[0].operation.receipt?.path, firstRead.path);
      assert.equal(original[0].operation.key.toolCallId, firstRead.callId);
      assert.equal(exchanges.length, 2);
      if (scenario === "replay") {
        const { sending, reply, request } = exchanges[1];
        const replay = () =>
          confirmAuditResponse(f.store, sending, lease, reply);
        assert.deepEqual(await replay(), pending);
        await assert.rejects(
          confirmAuditResponse(f.store, sending, lease, {
            ...reply,
            body: checkpointSimulatorResponse(request.body, {
              ...simulator,
              reads: [],
            }),
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
          tool_call_id: secondRead.callId,
          content: JSON.stringify({ code: "FORBIDDEN" }),
        });
        return;
      } else {
        if (scenario === "changed-file")
          await appendFile(
            join(f.root, secondRead.path),
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

test("PostgreSQL — 5. Два процесса претендуют на ревизию, а подтверждает только действующий владелец", async (t) => {
  const f = await setupCheckpointStorage(t, checkpointAssignment([entryPath]));
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
        body: checkpointSimulatorResponse(request.body, {
          ...f.simulator,
          reads: [],
        }),
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
