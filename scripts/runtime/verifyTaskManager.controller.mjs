/**
 * @file scripts/runtime/verifyTaskManager.controller.mjs
 * @version 1.0.0
 * @date 2026-10-11
 * @description Создаёт одноразовую PostgreSQL БД для проверки Task Manager и удаляет только созданную fixture.
 * @see documentation/specifications/task-management-execution.md
 */
import nextEnv from "@next/env";
import pg from "pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const url = new URL(process.env.DATABASE_URI || process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
url.hostname = "127.0.0.1";
// Соединение DDL использует служебную БД; таблицы рабочей установки не читаются.
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.href });
const name = "realize_task_fixture_" + randomBytes(8).toString("hex");
let created = false;
let child;
const stop = () => child?.kill("SIGTERM");
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  url.pathname = "/" + name;
  child = spawn(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.config.mts",
      "tests/int/task-manager-postgres.int.spec.ts",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URI: url.href,
        DATABASE_URL: url.href,
        TASK_TEST_DATABASE_URI: url.href,
        PAYLOAD_DB_PUSH: "false",
        REALIZE_AI_RUNTIME_ISOLATED: "true",
      },
      stdio: "inherit",
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  process.exitCode = code ?? 1;
} finally {
  try {
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  } finally {
    await admin.end();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
