/**
 * @file scripts/runtime/verifyUsageLedger.controller.mjs
 * @version 1.0.0
 * @date 2026-10-05
 * @description Создаёт отдельную PostgreSQL fixture, проверяет ledger и удаляет только созданную тестовую БД.
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
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
const name = "realize_usage_fixture_" + randomBytes(4).toString("hex");
let created = false;
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  url.pathname = "/" + name;
  const env = {
    ...process.env,
    DATABASE_URI: url.href,
    DATABASE_URL: url.href,
    USAGE_TEST_DATABASE_URI: url.href,
    PAYLOAD_DB_PUSH: "false",
    REALIZE_AI_RUNTIME_ISOLATED: "true",
  };
  const child = spawn(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.config.mts",
      "tests/int/usage-postgres.int.spec.ts",
    ],
    { env, stdio: "inherit" },
  );
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  process.exitCode = code ?? 1;
} finally {
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
