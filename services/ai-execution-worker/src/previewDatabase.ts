/**
 * @file services/ai-execution-worker/src/previewDatabase.ts
 * @owner services/ai-execution-worker
 * @purpose Clones, sanitizes and removes a preview-only PostgreSQL database.
 */

import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { Pool } from "pg";

const execute = promisify(execFile);

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

const requireDatabaseName = (value: string): string => {
  if (!/^[a-z][a-z0-9_]{7,62}$/.test(value)) {
    throw new Error("Preview database name is invalid.");
  }
  return value;
};

const connectionEnvironment = (databaseURL: string): NodeJS.ProcessEnv => {
  const url = new URL(databaseURL);
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("Preview database requires a PostgreSQL URL.");
  }
  return {
    LANG: process.env.LANG || "C.UTF-8",
    NODE_ENV: process.env.NODE_ENV || "development",
    PATH: process.env.PATH,
    PGHOST: url.hostname,
    PGPASSWORD: decodeURIComponent(url.password),
    PGPORT: url.port || "5432",
    PGSSLMODE:
      url.searchParams.get("sslmode") ||
      (process.env.POSTGRES_SSL === "true" ? "require" : "disable"),
    PGUSER: decodeURIComponent(url.username),
  };
};

const databaseNameFromURL = (databaseURL: string): string => {
  const name = decodeURIComponent(new URL(databaseURL).pathname.slice(1));
  if (!name)
    throw new Error("PostgreSQL URL does not contain a database name.");
  return name;
};

const databaseURLFor = (databaseURL: string, name: string): string => {
  const url = new URL(databaseURL);
  url.pathname = `/${name}`;
  return url.toString();
};

const maintenanceURLFor = (databaseURL: string): string =>
  databaseURLFor(databaseURL, "postgres");

const runTool = async (
  binary: "pg_dump" | "pg_restore",
  args: string[],
  databaseURL: string,
): Promise<void> => {
  await execute(binary, args, {
    encoding: "utf8",
    env: connectionEnvironment(databaseURL),
    maxBuffer: 2 * 1024 * 1024,
  });
};

const truncateIfPresent = async (
  pool: Pool,
  names: string[],
): Promise<void> => {
  const existing = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [names],
  );
  if (!existing.rows.length) return;
  await pool.query(
    `TRUNCATE TABLE ${existing.rows
      .map((row) => quoteIdentifier(row.table_name))
      .join(", ")} RESTART IDENTITY CASCADE`,
  );
};

const sanitizeUsers = async (pool: Pool): Promise<void> => {
  const result = await pool.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'`,
  );
  const columns = new Set(result.rows.map((row) => row.column_name));
  if (!columns.has("id")) return;
  const assignments: string[] = [];
  if (columns.has("email")) {
    assignments.push(
      `email = 'preview-user-' || id::text || '@invalid.example'`,
    );
  }
  if (columns.has("name"))
    assignments.push(`name = 'Preview User ' || id::text`);
  if (columns.has("hash"))
    assignments.push(`hash = md5(random()::text || id::text)`);
  if (columns.has("salt"))
    assignments.push(`salt = md5(random()::text || id::text)`);
  if (columns.has("reset_password_token"))
    assignments.push("reset_password_token = NULL");
  if (columns.has("reset_password_expiration"))
    assignments.push("reset_password_expiration = NULL");
  if (columns.has("login_attempts")) assignments.push("login_attempts = 0");
  if (columns.has("lock_until")) assignments.push("lock_until = NULL");
  if (assignments.length) {
    await pool.query(`UPDATE users SET ${assignments.join(", ")}`);
  }
};

const sanitizeFormEmails = async (pool: Pool): Promise<void> => {
  const result = await pool.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'forms_emails'
        AND column_name IN ('email_from', 'email_to')`,
  );
  if (!result.rows.length) return;
  const assignments = result.rows.map(
    (row) => `${quoteIdentifier(row.column_name)} = 'disabled@invalid.example'`,
  );
  await pool.query(`UPDATE forms_emails SET ${assignments.join(", ")}`);
};

const sanitizeDatabase = async (databaseURL: string): Promise<void> => {
  const pool = new Pool({ connectionString: databaseURL, max: 1 });
  try {
    const aiTables = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'realize_ai_%'
        ORDER BY table_name`,
    );
    await truncateIfPresent(
      pool,
      aiTables.rows.map((row) => row.table_name),
    );
    await truncateIfPresent(pool, [
      "addresses",
      "carts",
      "form_submissions",
      "form_submissions_submission_data",
      "orders",
      "transactions",
      "users_sessions",
    ]);
    await sanitizeUsers(pool);
    await sanitizeFormEmails(pool);
  } finally {
    await pool.end();
  }
};

/** Creates a physical clone and removes PII, sessions and AI runtime records. */
export const clonePreviewDatabase = async (input: {
  databaseName: string;
  databaseURL: string;
  runtimeRoot: string;
}): Promise<{ databaseName: string; databaseURL: string }> => {
  const databaseName = requireDatabaseName(input.databaseName);
  await mkdir(input.runtimeRoot, { mode: 0o700, recursive: true });
  const dumpPath = join(input.runtimeRoot, `${databaseName}.dump`);
  const sourceName = databaseNameFromURL(input.databaseURL);
  const maintenance = new Pool({
    connectionString: maintenanceURLFor(input.databaseURL),
    max: 1,
  });
  let created = false;
  try {
    await runTool(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        dumpPath,
        sourceName,
      ],
      input.databaseURL,
    );
    await maintenance.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    created = true;
    await runTool(
      "pg_restore",
      [
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
        "--dbname",
        databaseName,
        dumpPath,
      ],
      input.databaseURL,
    );
    const previewURL = databaseURLFor(input.databaseURL, databaseName);
    await sanitizeDatabase(previewURL);
    return { databaseName, databaseURL: previewURL };
  } catch (error) {
    if (created) {
      await maintenance.query(
        `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [databaseName],
      );
      await maintenance.query(
        `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
      );
    }
    throw error;
  } finally {
    await maintenance.end();
    await rm(dumpPath, { force: true });
  }
};

/** Terminates preview-only connections and drops one validated clone. */
export const dropPreviewDatabase = async (
  databaseURL: string,
  databaseName: string,
): Promise<void> => {
  const name = requireDatabaseName(databaseName);
  const maintenance = new Pool({
    connectionString: maintenanceURLFor(databaseURL),
    max: 1,
  });
  try {
    await maintenance.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await maintenance.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)}`);
  } finally {
    await maintenance.end();
  }
};
