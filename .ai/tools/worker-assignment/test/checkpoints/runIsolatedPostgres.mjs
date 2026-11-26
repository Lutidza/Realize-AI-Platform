/**
 * @file .ai/tools/worker-assignment/test/checkpoints/runIsolatedPostgres.mjs
 * @version 1.3.3
 * @date 2026-11-26
 * @description Запускает приёмку хранилища на отдельном временном кластере PostgreSQL.
 * @see documentation/specifications/task-management/execution/checkpoint-storage.md
 */
import { ASSIGNMENT_TEST_DATABASE } from "@realize/payload-task-manager/audit-review/test-database";
import { execFile, spawn } from "node:child_process";
import {
  access,
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const suites = new Map([
  ["checkpoint", "./checkpointStorage.test.ts"],
  ["rework", "../rework/auditRework.test.ts"],
  ["conclusion", "../conclusion/reviewConclusion.test.ts"],
  ["publication", "../publication/auditPublication.test.ts"],
]);
const suite = suites.get(process.argv[2] ?? "checkpoint");
if (!suite || process.argv.length > 3)
  throw new Error("Неизвестный сценарий PostgreSQL.");
const testFile = fileURLToPath(new URL(suite, import.meta.url));
// libpq, Node и приложение получают только явные настройки этого кластера.
const environment = { PATH: process.env.PATH, LC_ALL: "C", TZ: "UTC" };
const postgresBin = (
  await execute("pg_config", ["--bindir"], { env: environment })
).stdout.trim();
const workspace = await mkdtemp("/tmp/realize-checkpoint-pg-");
const data = join(workspace, "data");
const socket = join(workspace, "socket");
const db = {
  PGHOST: socket,
  PGPORT: "5432",
  PGUSER: "realize_checkpoint_runner",
  PGDATABASE: ASSIGNMENT_TEST_DATABASE,
};
const runPg = (name, args) =>
  execute(join(postgresBin, name), args, { env: { ...environment, ...db } });
const abort = new AbortController();
let interrupted = false;
const stop = () => {
  interrupted = true;
  abort.abort();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await mkdir(socket, { mode: 0o700 });
  await runPg("initdb", [
    "-D",
    data,
    "-U",
    db.PGUSER,
    "--encoding=UTF8",
    "--locale=C",
    "--auth-local=trust",
    "--auth-host=reject",
  ]);
  abort.signal.throwIfAborted();
  // Закрытый каталог под /tmp создаёт mkdtemp; PostgreSQL не открывает TCP и сохраняет синхронный commit.
  await appendFile(
    join(data, "postgresql.conf"),
    `\nlisten_addresses = ''\nunix_socket_directories = '${socket}'\nunix_socket_permissions = 0700\nport = ${db.PGPORT}\nfsync = on\nsynchronous_commit = on\n`,
  );
  const startupLog = join(workspace, "postgres.log");
  try {
    await runPg("pg_ctl", [
      "-D",
      data,
      "-l",
      startupLog,
      "-w",
      "-t",
      "30",
      "start",
    ]);
  } catch (cause) {
    const diagnostic = await readFile(startupLog, "utf8").catch(() => "");
    throw new Error(
      "Не удалось запустить тестовую PostgreSQL. " + diagnostic.trim(),
      { cause },
    );
  }
  abort.signal.throwIfAborted();
  await runPg("createdb", ["--maintenance-db=postgres", db.PGDATABASE]);
  abort.signal.throwIfAborted();

  // Запрет действует и в дочерних процессах после рестарта. Любая попытка fetch проваливает прогон.
  const rejectFetch =
    "globalThis.fetch=async()=>{process.exitCode=1;throw new Error('model_transport_forbidden')}";
  const modelGuard =
    "--import=data:text/javascript," + encodeURIComponent(rejectFetch);
  const test = spawn(
    process.execPath,
    ["--import=tsx/esm", "--test", testFile],
    {
      env: { ...environment, ...db, NODE_OPTIONS: modelGuard },
      stdio: "inherit",
      signal: abort.signal,
    },
  );
  const code = await new Promise((resolve, reject) => {
    test.once("error", reject);
    test.once("exit", (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
} finally {
  try {
    const hasPostmaster = await access(join(data, "postmaster.pid")).then(
      () => true,
      (error) => {
        if (error.code === "ENOENT") return false;
        throw error;
      },
    );
    if (hasPostmaster)
      await runPg("pg_ctl", [
        "-D",
        data,
        "-m",
        "fast",
        "-w",
        "-t",
        "30",
        "stop",
      ]);
    await rm(workspace, { recursive: true });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    if (interrupted) process.exitCode = 1;
  }
}
