/**
 * @file .ai/tools/worker-assignment/test/checkpoints/checkpointStorage.fixture.ts
 * @version 2.0.2
 * @date 2026-11-26
 * @description Готовит контрольную точку переданной попытки и запускает процессы обмена с журналом транспорта.
 * @see documentation/specifications/task-management/execution/checkpoint-storage.md
 */
import { ASSIGNMENT_TEST_DATABASE } from "@realize/payload-task-manager/audit-review/test-database";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PostgresCheckpointStore } from "../../src/checkpoints/PostgresCheckpoint.repository";
import { createAuditCheckpointState } from "../../src/checkpoints/createAuditCheckpointState.service";
import type {
  CheckpointAuditInput,
  CheckpointProcessInput,
  CheckpointProcessAction,
  CheckpointProcessOptions,
  CheckpointProcessCommand,
  ChildResult,
  JournalRecord,
} from "./CheckpointScenario.types";

export function openAssignmentTestPool() {
  if (
    process.env.PGDATABASE !== ASSIGNMENT_TEST_DATABASE ||
    !process.env.PGHOST?.startsWith("/")
  )
    throw new Error(
      "Используйте npm run check:assignment:postgres -- checkpoint для создания отдельной БД.",
    );
  return new pg.Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    database: process.env.PGDATABASE,
    ssl: false,
  });
}

/** Привязка задачи фиксируется при вызове и передаётся во все последующие шаги попытки. */
export async function setupCheckpointStorage(
  t: TestContext,
  audit: CheckpointAuditInput,
) {
  const { attemptId } = audit;
  const task = { ...audit.task };
  const simulator = structuredClone(audit.simulator);
  const f = await audit.prepareContext(t);
  const pool = openAssignmentTestPool();
  t.after(() => pool.end());
  const store = new PostgresCheckpointStore(pool);
  await store.initialize();
  const state = await createAuditCheckpointState(
    f.policy,
    { lockPath: f.lockPath, contextId: f.contextId, model: f.model },
    task,
  );
  const initial = await store.create(attemptId, state);
  return { ...f, pool, store, attemptId, task, simulator, initial };
}

export async function readCheckpointJournal(
  f: Pick<CheckpointProcessInput, "root">,
): Promise<JournalRecord[]> {
  const log = await readFile(join(f.root, "simulator.jsonl"), "utf8");
  return log
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
}

/** Дочерний процесс получает привязку попытки и сценарий ответов, историю восстанавливает из контрольной точки. */
export function runCheckpointProcess(
  f: CheckpointProcessInput,
  action: CheckpointProcessAction,
  options: CheckpointProcessOptions = {},
): Promise<ChildResult> {
  const input: CheckpointProcessCommand = {
    root: f.root,
    attemptId: f.attemptId,
    task: f.task,
    simulator: f.simulator,
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
