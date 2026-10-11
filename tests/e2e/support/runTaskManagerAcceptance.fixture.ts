/**
 * @file tests/e2e/support/runTaskManagerAcceptance.fixture.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Запускает браузерную приёмку постоянных задач на новой БД и отдельном Next без фоновых исполнителей.
 * @see documentation/specifications/task-management-execution.md
 */
import nextEnv from "@next/env";
import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { format, resolveConfig } from "prettier";
import type { Payload } from "payload";
import type { MigrateUpArgs } from "@payloadcms/db-postgres";
import assert from "node:assert/strict";
import { migrations } from "../../../src/migrations";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const source = new URL(process.env.DATABASE_URI || process.env.DATABASE_URL!);
assert.ok(["localhost", "127.0.0.1"].includes(source.hostname));
source.hostname = "127.0.0.1";
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.href });
const runId = randomBytes(8).toString("hex");
const name = `realize_task_browser_fixture_${runId}`;
const task =
  process.env.TASK_BROWSER_TASK ||
  ".ai-workspace/tasks/2026-10-11-task-manager-foundation-d3c9";
assert.ok(/^\.ai-workspace\/tasks\/[A-Za-z0-9_-]+$/.test(task));
const logs = resolve(task, "logs", `task-browser-${runId}`);
const screenshots = resolve(task, "screenshots", `task-browser-${runId}`);
const distDir = `${task}/tmp/task-browser-${runId}/next`;
await mkdir(logs, { recursive: true });
await mkdir(screenshots, { recursive: true });
console.log(`Task Manager browser evidence: ${logs}`);
const previousIncludes = new Set<string>(
  JSON.parse(await readFile("tsconfig.json", "utf8")).include,
);
const ownedIncludes = new Set([
  `${distDir}/types/**/*.ts`,
  `${distDir}/dev/types/**/*.ts`,
]);
const stopping = new AbortController();
const stop = () => stopping.abort();
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
let created = false;
let client: pg.Client | undefined;
let payload: Payload | undefined;
let server: ReturnType<typeof spawn> | undefined;
const exit = (child: ReturnType<typeof spawn>): Promise<number | null> =>
  child.exitCode !== null
    ? Promise.resolve(child.exitCode)
    : new Promise((ok, fail) => {
        child.once("error", fail);
        child.once("close", ok);
      });
const port = await new Promise<number>((ok, fail) => {
  const listener = createServer();
  listener.once("error", fail);
  listener.listen(0, "127.0.0.1", () => {
    const address = listener.address();
    assert.ok(address && typeof address !== "string");
    listener.close(() => ok(address.port));
  });
});
const baseURL = `http://127.0.0.1:${port}`;
try {
  await admin.connect();
  stopping.signal.throwIfAborted();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const uri = new URL(source);
  uri.pathname = "/" + name;
  process.env.DATABASE_URI = uri.href;
  process.env.DATABASE_URL = uri.href;
  process.env.PAYLOAD_DB_PUSH = "false";
  process.env.REALIZE_AI_RUNTIME_ISOLATED = "true";
  process.env.REALIZE_PLATFORM_OWNER_USER_IDS = "";
  process.env.TASK_BROWSER_PASSWORD = randomBytes(24).toString("base64url");
  client = new pg.Client({ connectionString: uri.href });
  await client.connect();
  const dialect = new PgDialect();
  const args = {
    db: {
      execute: async (statement) => {
        if (typeof statement === "string") return client!.query(statement);
        const query = dialect.sqlToQuery(statement.getSQL());
        return client!.query(query.sql, query.params);
      },
    },
  } as MigrateUpArgs;
  for (const migration of migrations) {
    stopping.signal.throwIfAborted();
    await client.query("BEGIN");
    try {
      await migration.up(args);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  const { openMcpPayload } =
    await import("../../../services/internal-mcp/src/openMcpPayload.adapter");
  payload = await openMcpPayload();
  for (const [email, label, role] of [
    ["task-owner@example.test", "Task owner fixture", "admin"],
    ["task-member@example.test", "Task member fixture", "admin"],
    ["task-customer@example.test", "Task customer fixture", "customer"],
  ] as const)
    await payload.create({
      collection: "users",
      overrideAccess: true,
      data: {
        email,
        name: label,
        password: process.env.TASK_BROWSER_PASSWORD,
        roles: [role],
      },
    });
  await payload.destroy();
  payload = undefined;
  const env = {
    ...process.env,
    PORT: String(port),
    REALIZE_NEXT_DIST_DIR: distDir,
    NEXT_PUBLIC_SERVER_URL: baseURL,
    PAYLOAD_PUBLIC_SERVER_URL: baseURL,
    NEXT_PUBLIC_SITE_URL: baseURL,
    PAYLOAD_PUBLIC_SITE_URL: baseURL,
    PAYLOAD_PUBLIC_LIVE_PREVIEW_URL: baseURL,
  };
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  const log = createWriteStream(resolve(logs, "server.log"));
  server.stdout!.pipe(log, { end: false });
  server.stderr!.pipe(log, { end: false });
  server.once("close", () => log.end());
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    stopping.signal.throwIfAborted();
    if (server.exitCode !== null) throw new Error("TASK_BROWSER_SERVER_EXITED");
    try {
      const response = await fetch(`${baseURL}/api/health/live`, {
        signal: AbortSignal.any([stopping.signal, AbortSignal.timeout(3000)]),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  assert.ok(ready, "TASK_BROWSER_SERVER_NOT_READY");
  // Компиляция защищённого маршрута не требует входа и не читает рабочую установку.
  await fetch(`${baseURL}/system/task-manager`, {
    redirect: "manual",
    signal: AbortSignal.any([stopping.signal, AbortSignal.timeout(240000)]),
  });
  const child = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "tests/e2e/task-manager.spec.ts",
      "--project=chromium",
      "--workers=1",
      "--retries=0",
      "--reporter=line",
      `--output=${resolve(logs, "playwright")}`,
    ],
    {
      env: {
        ...env,
        TASK_BROWSER_ACCEPTANCE: "true",
        TASK_BROWSER_EVIDENCE_DIR: screenshots,
        TASK_BROWSER_LOGS_DIR: logs,
        PLAYWRIGHT_SKIP_WEB_SERVER: "true",
        PLAYWRIGHT_BASE_URL: baseURL,
      },
      stdio: "inherit",
      signal: stopping.signal,
    },
  );
  process.exitCode = (await exit(child)) ?? 1;
  await writeFile(
    resolve(logs, "fixture-result.json"),
    JSON.stringify(
      {
        database: name,
        port,
        distDir,
        migrationCount: migrations.length,
        outcome: process.exitCode === 0 ? "passed" : "failed",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]")
      : "TASK_BROWSER_FIXTURE_FAILED",
  );
  process.exitCode = 1;
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    await Promise.race([
      exit(server),
      new Promise((ok) => setTimeout(ok, 5000)),
    ]);
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {}
  }
  try {
    await payload?.destroy();
  } finally {
    try {
      await client?.end();
    } finally {
      try {
        if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    }
  }
  if (server) {
    // Сохраняем все чужие текущие include; удаляем только две точные записи нашей fixture.
    const config = JSON.parse(await readFile("tsconfig.json", "utf8"));
    const current: string[] = config.include;
    config.include = current.filter(
      (path) => !ownedIncludes.has(path) || previousIncludes.has(path),
    );
    if (config.include.length !== current.length)
      await writeFile(
        "tsconfig.json",
        await format(JSON.stringify(config), {
          ...(await resolveConfig("tsconfig.json")),
          parser: "json",
        }),
      );
  }
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
