/**
 * @file scripts/runtime/verifyExtensionManager.controller.mjs
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет appearance persistence в собственной одноразовой PostgreSQL БД и удаляет только эту fixture.
 * @see documentation/specifications/extension-management.md
 */
import nextEnv from "@next/env";
import pg from "pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

async function verifyExtensionManager() {
  const rawUri = process.env.DATABASE_URI || process.env.DATABASE_URL;
  if (!rawUri) throw new Error("LOCAL_POSTGRES_CONFIGURATION_REQUIRED");
  const fixtureUrl = new URL(rawUri);
  if (!["localhost", "127.0.0.1"].includes(fixtureUrl.hostname)) {
    throw new Error("LOCAL_POSTGRES_CONFIGURATION_REQUIRED");
  }
  fixtureUrl.hostname = "127.0.0.1";
  // DDL выполняется через /postgres; рабочая БД и её таблицы не открываются.
  const adminUrl = new URL(fixtureUrl);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.href });
  const name = `realize_extension_fixture_${randomBytes(8).toString("hex")}`;
  let created = false;
  let child;
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    child?.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await admin.connect();
    if (interrupted) return 1;
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    if (interrupted) return 1;
    fixtureUrl.pathname = `/${name}`;
    child = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.config.mts",
        "tests/int/extension-appearance-postgres.int.spec.ts",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URI: fixtureUrl.href,
          DATABASE_URL: fixtureUrl.href,
          EXTENSION_TEST_DATABASE_URI: fixtureUrl.href,
          PAYLOAD_DB_PUSH: "false",
          PAYLOAD_DROP_DATABASE: "false",
          REALIZE_AI_RUNTIME_ISOLATED: "true",
        },
        stdio: "inherit",
      },
    );
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
  } finally {
    try {
      if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await admin.end();
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
  }
}

try {
  process.exitCode = await verifyExtensionManager();
} catch {
  // Ни connectionString, ни driver cause не попадают в console.
  console.error("EXTENSION_FIXTURE_VERIFICATION_FAILED");
  process.exitCode = 1;
}
