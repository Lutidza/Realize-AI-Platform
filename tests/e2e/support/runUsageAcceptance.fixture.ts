/**
 * @file tests/e2e/support/runUsageAcceptance.fixture.ts
 * @version 1.1.0
 * @date 2026-10-05
 * @description Проверяет две роли Admin на отдельной базе и web process без фоновых исполнителей.
 */
import nextEnv from "@next/env";
import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Payload } from "payload";
import type { MigrateUpArgs } from "@payloadcms/db-postgres";
import type { UsageDatabase } from "../../../packages/payload-ai-plugin/src/usage/UsageStore.types";
import assert from "node:assert/strict";
import { migrations } from "../../../src/migrations/index";
import {
  UsageLedgerRepository,
  UsagePricingRepository,
  UsageBudgetsRepository,
} from "../../../packages/payload-ai-plugin/src/usage/usage.server.index";
import {
  usageAttemptFixture,
  usagePriceFixture,
  usageObservationFixture,
} from "../../../tests/int/fixtures/usageLedger.fixture";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const original = new URL(process.env.DATABASE_URI || process.env.DATABASE_URL!);
assert.ok(["localhost", "127.0.0.1"].includes(original.hostname));
original.hostname = "127.0.0.1";
const admin = new pg.Client({ connectionString: original.href });
await admin.connect();
const name = "realize_usage_fixture_" + randomBytes(4).toString("hex");
const task =
  process.env.USAGE_ACCEPTANCE_TASK ||
  `.ai-workspace/tasks/${new Date().toISOString().slice(0, 10)}-usage-acceptance-${randomBytes(4).toString("hex")}`;
assert.ok(/^\.ai-workspace\/tasks\/[A-Za-z0-9_-]+$/.test(task));
await mkdir(resolve(task, "logs"), { recursive: true });
await mkdir(resolve(task, "screenshots"), { recursive: true });
console.log(`Usage acceptance evidence: ${task}`);
const distDir = `${task}/tmp/next`;
const originalIncludes = new Set<string>(
  JSON.parse(await readFile("tsconfig.json", "utf8")).include,
);
const stopping = new AbortController();
const stop = () => stopping.abort();
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
let created = false;
let client: pg.Client | undefined;
let payload: Payload | undefined;
let server: ReturnType<typeof spawn> | undefined;
const childExit = (child: ReturnType<typeof spawn>) =>
  child.exitCode !== null
    ? Promise.resolve(child.exitCode)
    : new Promise<number | null>((ok, fail) => {
        child.once("error", fail);
        child.once("close", ok);
      });
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  await writeFile(
    resolve(task, "logs/browser-fixture.json"),
    JSON.stringify({ database: name, pid: process.pid }),
  );
  const uri = new URL(original);
  uri.pathname = "/" + name;
  process.env.DATABASE_URI = uri.href;
  process.env.DATABASE_URL = uri.href;
  process.env.PAYLOAD_DB_PUSH = "false";
  process.env.REALIZE_AI_RUNTIME_ISOLATED = "true";
  process.env.REALIZE_INSTALLATION_ID = "usage-browser";
  process.env.REALIZE_PROJECT_ID = "site";
  process.env.USAGE_BROWSER_PASSWORD = randomBytes(24).toString("base64url");
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
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  const { openMcpPayload } =
    await import("../../../services/internal-mcp/src/openMcpPayload.adapter");
  payload = await openMcpPayload();
  const owner = await payload.create({
    collection: "users",
    data: {
      email: "usage-owner@example.test",
      password: process.env.USAGE_BROWSER_PASSWORD,
      roles: ["admin"],
      name: "Usage owner fixture",
    },
  });
  await payload.create({
    collection: "users",
    data: {
      email: "usage-admin@example.test",
      password: process.env.USAGE_BROWSER_PASSWORD,
      roles: ["admin"],
      name: "Usage admin fixture",
    },
  });
  process.env.REALIZE_PLATFORM_OWNER_USER_IDS = String(owner.id);
  const db = payload.db as UsageDatabase;
  const pricing = new UsagePricingRepository(db);
  const ledger = new UsageLedgerRepository(db);
  for (const basis of ["provider", "customer"] as const)
    await pricing.publish({
      actorId: String(owner.id),
      price: usagePriceFixture({
        installationId: "usage-browser",
        basis,
        method: basis === "provider" ? "api_tariff" : "customer_tariff",
      }),
    });
  await new UsageBudgetsRepository(db).update({
    actorId: String(owner.id),
    eventId: randomUUID(),
    expectedRevision: 0,
    policy: {
      schemaVersion: "1.0",
      installationId: "usage-browser",
      projectId: "site",
      purpose: "customer_runtime",
      basis: "customer",
      currency: "USD",
      mode: "soft",
      revision: 1,
      limitNanos: "10000000000",
      reservationNanos: "1000000000",
    },
  });
  for (const entry of [
    {
      taskId: "customer-content",
      purpose: "customer_runtime",
      installationId: "usage-browser",
      partial: false,
    },
    {
      taskId: "customer-retry",
      purpose: "customer_runtime",
      installationId: "usage-browser",
      partial: true,
    },
    {
      taskId: "owner-development",
      purpose: "development",
      installationId: "usage-browser",
      partial: false,
    },
    {
      taskId: "foreign-project",
      purpose: "customer_runtime",
      installationId: "foreign-installation",
      partial: false,
    },
  ] as const) {
    const attempt = await ledger.begin(
      usageAttemptFixture({
        actorId: String(owner.id),
        installationId: entry.installationId,
        taskId: entry.taskId,
        purpose: entry.purpose,
        workflowKey: "content",
        agentProfileKey: "editor",
      }),
    );
    await ledger.observe(
      usageObservationFixture(attempt.attemptId, {
        outcome: entry.partial ? "failed" : "completed",
        coverage: entry.partial ? "partial" : "turn",
      }),
    );
  }
  // Отдельная БД: серия синтетических измерений проверяет график и фильтры без AI-вызовов.
  for (const basis of ["provider", "customer"] as const)
    await pricing.publish({
      actorId: String(owner.id),
      price: usagePriceFixture({
        installationId: "usage-browser",
        model: "compact-model",
        basis,
        method: basis === "provider" ? "api_tariff" : "customer_tariff",
        rates: {
          inputNanos: "1000000000",
          cachedInputNanos: "250000000",
          outputNanos: "2000000000",
          secondNanos: null,
        },
      }),
    });
  for (const day of [1, 3, 5, 8, 11, 15, 20, 25, 35, 42]) {
    for (const [variant, model] of ["test-model", "compact-model"].entries()) {
      const input = usageAttemptFixture({
        installationId: "usage-browser",
        taskId: `analytics-fixture-${day}`,
        workflowKey: variant ? "catalog" : "content",
        agentProfileKey: variant ? "assistant" : "editor",
        source: "workflow",
      });
      input.requestedModel = model;
      input.startedAt = new Date(Date.now() - day * 86400000).toISOString();
      const attempt = await ledger.begin(input);
      const inputTokens = 15000 + day * 1234 + (variant ? 6000 : 0),
        outputTokens = 1200 + day * 153;
      await ledger.observe(
        usageObservationFixture(attempt.attemptId, {
          model,
          outcome: day === 5 ? "failed" : "completed",
          durationMs: 6000 + day * 1357,
          tokens: {
            inputTokens,
            cachedInputTokens: Math.floor(inputTokens * (variant ? 0.6 : 0.3)),
            outputTokens,
            reasoningOutputTokens: null,
            totalTokens: inputTokens + outputTokens,
          },
        }),
      );
    }
  }
  const missingPrice = usageAttemptFixture({
    installationId: "usage-browser",
    taskId: "unpriced-fixture",
  });
  missingPrice.requestedModel = "unpriced-model";
  const unpricedAttempt = await ledger.begin(missingPrice);
  await ledger.observe(
    usageObservationFixture(unpricedAttempt.attemptId, {
      model: "unpriced-model",
    }),
  );
  await payload.destroy();
  payload = undefined;
  const env = {
    ...process.env,
    PORT: "3408",
    REALIZE_NEXT_DIST_DIR: distDir,
    NEXT_PUBLIC_SERVER_URL: "http://127.0.0.1:3408",
    PAYLOAD_PUBLIC_SERVER_URL: "http://127.0.0.1:3408",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3408",
    PAYLOAD_PUBLIC_SITE_URL: "http://127.0.0.1:3408",
    PAYLOAD_PUBLIC_LIVE_PREVIEW_URL: "http://127.0.0.1:3408",
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
      "3408",
    ],
    { env, stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
  const log = createWriteStream(resolve(task, "logs/browser-server.log"));
  server.stdout!.pipe(log, { end: false });
  server.stderr!.pipe(log, { end: false });
  server.once("close", () => log.end());
  let ready = false;
  for (let n = 0; n < 120; n++) {
    stopping.signal.throwIfAborted();
    if (server.exitCode !== null) throw new Error("BROWSER_SERVER_EXITED");
    try {
      const response = await fetch("http://127.0.0.1:3408/api/health/live", {
        signal: AbortSignal.any([stopping.signal, AbortSignal.timeout(3000)]),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  assert.ok(ready, "BROWSER_SERVER_NOT_READY");
  await fetch("http://127.0.0.1:3408/admin/login", {
    signal: AbortSignal.any([stopping.signal, AbortSignal.timeout(240000)]),
  });
  const child = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "tests/e2e/usage-admin.e2e.spec.ts",
      "--project=chromium",
      "--workers=1",
      "--retries=0",
      "--reporter=line",
    ],
    {
      env: {
        ...env,
        USAGE_BROWSER_ACCEPTANCE: "true",
        USAGE_BROWSER_EVIDENCE_DIR: resolve(task, "screenshots"),
        PLAYWRIGHT_SKIP_WEB_SERVER: "true",
        PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3408",
      },
      stdio: "inherit",
      signal: stopping.signal,
    },
  );
  process.exitCode = (await childExit(child)) ?? 1;
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]")
      : "fixture_failed",
  );
  process.exitCode = 1;
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    await Promise.race([
      childExit(server),
      new Promise((ok) => setTimeout(ok, 5000)),
    ]);
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {}
  }
  await payload?.destroy();
  await client?.end();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
  // Удаляем только include, добавленные нашим Next; прочие изменения пользователя сохраняются.
  if (server) {
    const tsconfig = JSON.parse(await readFile("tsconfig.json", "utf8"));
    tsconfig.include = tsconfig.include.filter(
      (path: string) =>
        !path.startsWith(`${distDir}/`) || originalIncludes.has(path),
    );
    await writeFile("tsconfig.json", JSON.stringify(tsconfig, null, 2) + "\n");
    const typegen = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "typegen"],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URI: original.href,
          DATABASE_URL: original.href,
        },
      },
    );
    if ((await childExit(typegen)) !== 0) process.exitCode = 1;
    const format = spawn(
      process.execPath,
      ["node_modules/prettier/bin/prettier.cjs", "--write", "tsconfig.json"],
      { stdio: "inherit" },
    );
    if ((await childExit(format)) !== 0) process.exitCode = 1;
  }
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}
