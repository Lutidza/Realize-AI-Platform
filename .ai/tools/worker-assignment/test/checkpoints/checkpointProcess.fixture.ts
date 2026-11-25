/**
 * @file .ai/tools/worker-assignment/test/checkpoints/checkpointProcess.fixture.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Имитирует ответы транспорта в отдельном процессе, включая аварийный выход после отправки.
 * @see documentation/specifications/task-management/execution/article-audit-storage-pilot.md
 */
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { createRepositoryReadPolicy } from "../../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { advanceAuditCheckpoint } from "../../src/checkpoints/advanceAuditCheckpoint.service";
import { PostgresCheckpointStore } from "../../src/checkpoints/PostgresCheckpoint.repository";
import type { SingleReadTransport } from "../../src/exchange/SingleRead.types";
import { view } from "../articleAudit.fixture";
import { openPilotPool } from "./checkpointPilot.fixture";
import type { PilotCommand } from "./CheckpointPilot.types";

const command: PilotCommand = JSON.parse(process.argv[2]);
const { root, attemptId, task, action, options } = command;
const pid = process.pid;
const pool = openPilotPool();
const store = new PostgresCheckpointStore(pool);
const transport: SingleReadTransport = {
  async send(request) {
    await appendFile(
      join(root, "simulator.jsonl"),
      JSON.stringify({ ...request, pid }) + "\n",
      { mode: 0o600 },
    );
    if (action === "crash") process.kill(pid, "SIGKILL");
    const count = JSON.parse(request.body).messages.length;
    const choice =
      count === 5
        ? {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "Отчёт имитатора о двух диапазонах формы.\n",
            },
          }
        : {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  type: "function",
                  id: count === 1 ? "article-call-1" : "article-call-2",
                  function: {
                    name: "repo_read_file",
                    arguments: JSON.stringify({
                      path: view,
                      startLine: count === 1 ? 20 : 60,
                      lineCount: 20,
                    }),
                  },
                },
              ],
            },
          };
    return {
      attemptId: request.attemptId,
      requestId: request.requestId,
      body: { choices: [choice] },
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
