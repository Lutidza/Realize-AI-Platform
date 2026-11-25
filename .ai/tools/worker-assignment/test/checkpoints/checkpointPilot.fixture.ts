/**
 * @file .ai/tools/worker-assignment/test/checkpoints/checkpointPilot.fixture.ts
 * @version 1.0.1
 * @date 2026-11-25
 * @description Создаёт отдельное назначение пилота и запускает процессы обмена с независимым журналом транспорта.
 * @see documentation/specifications/task-management/execution/article-audit-storage-pilot.md
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { openAiChatPolicy } from "../../../../../services/ai-control-plane/src/model-providers/openaiChatCompletions.policy";
import { PostgresCheckpointStore } from "../../src/checkpoints/PostgresCheckpoint.repository";
import { createAuditCheckpointState } from "../../src/checkpoints/createAuditCheckpointState.service";
import type {
  PilotInput,
  PilotAction,
  PilotOptions,
  PilotCommand,
  ChildResult,
  JournalRecord,
} from "./CheckpointPilot.types";
import { articleAuditFixture, lockPath } from "../articleAudit.fixture";

export function openPilotPool() {
  if (
    process.env.PGDATABASE !== "realize_checkpoint_pilot" ||
    !process.env.PGHOST?.startsWith("/")
  )
    throw new Error(
      "Используйте npm run ai:assignment:checkpoint-pilot для создания отдельной БД.",
    );
  return new pg.Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    database: process.env.PGDATABASE,
    ssl: false,
  });
}

export async function setupCheckpointPilot(t: TestContext) {
  const f = await articleAuditFixture(t);
  const pool = openPilotPool();
  t.after(() => pool.end());
  const store = new PostgresCheckpointStore(pool);
  await store.initialize();
  const attemptId = randomUUID();
  const task = {
    projectId: randomUUID(),
    taskId: randomUUID(),
    taskRevision: 1,
    executionId: randomUUID(),
    planRevision: 1,
    stageId: "frontend-audit",
    taskAssignmentId: randomUUID(),
    assignmentRevision: 1,
  };
  const state = await createAuditCheckpointState(
    f.policy,
    { lockPath, contextId: f.contextId, model: openAiChatPolicy.model },
    task,
  );
  const initial = await store.create(attemptId, state);
  return { ...f, pool, store, attemptId, task, initial };
}

export async function readCheckpointJournal(
  f: Pick<PilotInput, "root">,
): Promise<JournalRecord[]> {
  const log = await readFile(join(f.root, "simulator.jsonl"), "utf8");
  return log
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
}

/** Дочерний процесс получает только ссылку на фикстуру и снимок задачи. Память обмена между запусками не переносится. */
export function runCheckpointProcess(
  f: PilotInput,
  action: PilotAction,
  options: PilotOptions = {},
): Promise<ChildResult> {
  const input: PilotCommand = {
    root: f.root,
    attemptId: f.attemptId,
    task: f.task,
    action,
    options,
  };
  const child = spawn(
    process.execPath,
    [
      "--import=tsx/esm",
      fileURLToPath(new URL("./checkpointProcess.fixture.ts", import.meta.url)),
      JSON.stringify(input),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  return new Promise((resolve, reject) => {
    let output = "",
      errors = "";
    child.stdout.setEncoding("utf8").on("data", (data) => {
      output += data;
    });
    child.stderr.setEncoding("utf8").on("data", (data) => {
      errors += data;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (action === "crash" && signal === "SIGKILL")
        return resolve({ pid: child.pid!, status: "killed" });
      if (code !== 0)
        return reject(
          new Error(errors || "Ошибка процесса имитатора: " + (signal ?? code)),
        );
      try {
        resolve(JSON.parse(output));
      } catch (e) {
        reject(e);
      }
    });
  });
}
