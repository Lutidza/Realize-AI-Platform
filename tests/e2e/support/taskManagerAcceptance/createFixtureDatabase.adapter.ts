/**
 * @file tests/e2e/support/taskManagerAcceptance/createFixtureDatabase.adapter.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Создаёт, мигрирует и удаляет только собственную loopback БД Task Manager browser fixture.
 * @see documentation/specifications/task-management-execution.md
 */
import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Payload } from "payload";
import type { MigrateUpArgs } from "@payloadcms/db-postgres";
import { migrations } from "../../../../src/migrations";
import type { FixtureDatabaseSession } from "./TaskManagerAcceptance.types";
import { normalizeFixtureDatabaseSource } from "./normalizeFixtureDatabaseSource.config";
import { isDefiniteFixtureCreateRejection } from "./FixtureDatabaseCreateOutcome.validator";
/** Нет drop для неподтверждённого CREATE; неизвестный исход удерживает producer до review. */
export function createFixtureDatabase(
  source: URL,
  runId: string,
): FixtureDatabaseSession {
  if (!/^[a-f0-9]{16}$/.test(runId))
    throw new Error("TASK_BROWSER_DATABASE_INVALID");
  source = normalizeFixtureDatabaseSource(source);
  const name = `realize_task_browser_fixture_${runId}`;
  const adminUrl = new URL(source);
  adminUrl.pathname = "/postgres";
  const ownUrl = new URL(source);
  ownUrl.pathname = "/" + name;
  const admin = new pg.Client({
    connectionString: adminUrl.href,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  });
  let client: pg.Client | undefined;
  let payload: Payload | undefined;
  let created = false;
  let creationUnknown = false;
  let adminConnected = false;
  return {
    name,
    uri: ownUrl.href,
    async initialize(signal) {
      signal.throwIfAborted();
      await admin.connect();
      adminConnected = true;
      signal.throwIfAborted();
      const existing = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname=$1",
        [name],
      );
      if (existing.rowCount) throw new Error("TASK_BROWSER_DATABASE_COLLISION");
      creationUnknown = true;
      try {
        await admin.query(`CREATE DATABASE "${name}"`);
        created = true;
        creationUnknown = false;
      } catch (error) {
        if (isDefiniteFixtureCreateRejection(error)) creationUnknown = false;
        throw error;
      }
      process.env.DATABASE_URI = ownUrl.href;
      process.env.DATABASE_URL = ownUrl.href;
      process.env.PAYLOAD_DB_PUSH = "false";
      process.env.REALIZE_AI_RUNTIME_ISOLATED = "true";
      process.env.REALIZE_PLATFORM_OWNER_USER_IDS = "";
      client = new pg.Client({
        connectionString: ownUrl.href,
        connectionTimeoutMillis: 5000,
        statement_timeout: 30000,
      });
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
        signal.throwIfAborted();
        await client.query("BEGIN");
        try {
          await migration.up(args);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
      signal.throwIfAborted();
      const { openMcpPayload } =
        await import("../../../../services/internal-mcp/src/openMcpPayload.adapter");
      payload = await openMcpPayload();
      for (const [email, label, role] of [
        ["task-owner@example.test", "Task owner fixture", "admin"],
        ["task-member@example.test", "Task member fixture", "admin"],
        ["task-customer@example.test", "Task customer fixture", "customer"],
      ] as const) {
        signal.throwIfAborted();
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
      }
      await payload.destroy();
      payload = undefined;
    },
    async close() {
      const errors: string[] = [];
      try {
        await payload?.destroy();
        payload = undefined;
      } catch {
        errors.push("PAYLOAD_CLOSE_FAILED");
      }
      try {
        await client?.end();
        client = undefined;
      } catch {
        errors.push("FIXTURE_CLIENT_CLOSE_FAILED");
      }
      if (created && adminConnected) {
        try {
          await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
          created = false;
          const check = await admin.query(
            "SELECT 1 FROM pg_database WHERE datname=$1",
            [name],
          );
          if (check.rowCount) errors.push("FIXTURE_DATABASE_STILL_PRESENT");
        } catch {
          errors.push("FIXTURE_DATABASE_DROP_FAILED");
        }
      }
      if (creationUnknown) errors.push("FIXTURE_DATABASE_CREATE_UNKNOWN");
      try {
        await admin.end();
        adminConnected = false;
      } catch {
        errors.push("FIXTURE_ADMIN_CLOSE_FAILED");
      }
      return { quiescent: errors.length === 0 && !created, errors };
    },
  };
}
