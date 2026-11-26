/**
 * @file .ai/tools/worker-assignment/test/checkpoints/checkpointProcess.fixture.ts
 * @version 2.0.3
 * @date 2026-11-26
 * @description Имитирует ответы транспорта в отдельном процессе, включая аварийный выход после отправки.
 * @see documentation/specifications/task-management/execution/checkpoint-storage.md
 */
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { advanceAuditCheckpoint } from "../../src/checkpoints/advanceAuditCheckpoint.service";
import { PostgresCheckpointStore } from "../../src/checkpoints/PostgresCheckpoint.repository";
import type { SingleReadTransport } from "../../src/exchange/SingleRead.types";
import { openAssignmentTestPool } from "./checkpointStorage.fixture";
import { checkpointSimulatorResponse } from "./checkpointSimulatorResponse.fixture";
import type { CheckpointProcessCommand } from "./CheckpointScenario.types";

const command: CheckpointProcessCommand = JSON.parse(process.argv[2]);
const { root, attemptId, task, action, options, simulator } = command;
const pid = process.pid;
const pool = openAssignmentTestPool();
const store = new PostgresCheckpointStore(pool);
const transport: SingleReadTransport = {
  async send(request) {
    await appendFile(
      join(root, "simulator.jsonl"),
      JSON.stringify({ ...request, pid }) + "\n",
      { mode: 0o600 },
    );
    if (action === "crash") process.kill(pid, "SIGKILL");
    return {
      attemptId: request.attemptId,
      requestId: request.requestId,
      body: checkpointSimulatorResponse(request.body, simulator),
    };
  },
};

async function run() {
  const policy = await createRepositoryReadPolicy(root, true);
  let snapshot = await store.get(attemptId);
  const lease = await store.claim(
    attemptId,
    options.revision ?? snapshot.revision,
    options.ownerId ?? String(pid),
    action === "crash" ? 4000 : 30000,
  );
  try {
    snapshot = await advanceAuditCheckpoint(
      store,
      snapshot,
      lease,
      task,
      policy,
      transport,
    );
    if (action === "first-read" && snapshot.state.status === "pending")
      snapshot = await advanceAuditCheckpoint(
        store,
        snapshot,
        lease,
        task,
        policy,
        transport,
      );
    return {
      pid,
      status: snapshot.state.status,
      revision: snapshot.revision,
      fence: lease.fence,
    };
  } finally {
    await store.release(lease);
  }
}

try {
  console.log(JSON.stringify(await run()));
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== "checkpoint_lease_unavailable"
  )
    throw error;
  console.log(JSON.stringify({ pid, status: "blocked", error: error.message }));
} finally {
  await pool.end();
}
