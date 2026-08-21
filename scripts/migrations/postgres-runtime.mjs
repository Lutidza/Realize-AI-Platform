/**
 * @file scripts/migrations/postgres-runtime.mjs
 * @version 2026-08-17
 * @description Owns scoped PostgreSQL connections, tools and temporary database lifecycle.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

const { Client } = pg;
const temporaryDatabasePattern =
  /^realize_adopt_(?:clone|ref)_\d{14}_[a-f0-9]{6}$/;

function parseDatabaseUrl(connectionString) {
  const url = new URL(connectionString);
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error("Migration adoption requires a PostgreSQL connection URL.");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName || databaseName.includes("/")) {
    throw new Error(
      "PostgreSQL connection URL must contain one database name.",
    );
  }

  return { databaseName, url };
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * Validates the exact narrow namespace used for disposable adoption probes.
 *
 * @param {string} databaseName
 * @returns {void}
 * @throws {Error} When a database is outside the disposable probe namespace.
 */
export function assertTemporaryDatabaseName(databaseName) {
  if (!temporaryDatabasePattern.test(databaseName)) {
    throw new Error(
      `Refusing temporary database operation for: ${databaseName}`,
    );
  }
}

/**
 * Extracts a safe database label from a PostgreSQL URL.
 *
 * @param {string} connectionString
 * @returns {string}
 */
export function databaseNameFromUrl(connectionString) {
  return parseDatabaseUrl(connectionString).databaseName;
}

/**
 * Extracts the database role that must own temporary probe databases.
 *
 * @param {string} connectionString
 * @returns {string}
 */
export function databaseUserFromUrl(connectionString) {
  const { url } = parseDatabaseUrl(connectionString);
  const userName = decodeURIComponent(url.username);
  if (!userName)
    throw new Error("PostgreSQL connection URL must contain a user.");
  return userName;
}

/**
 * Returns the same PostgreSQL connection with a different database target.
 *
 * @param {string} connectionString
 * @param {string} databaseName
 * @returns {string}
 */
export function databaseUrlFor(connectionString, databaseName) {
  const { url } = parseDatabaseUrl(connectionString);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  return url.toString();
}

/**
 * Builds libpq environment variables so credentials never enter process argv.
 *
 * @param {string} connectionString
 * @param {string} [databaseName]
 * @returns {NodeJS.ProcessEnv}
 */
export function postgresEnvironment(connectionString, databaseName) {
  const parsed = parseDatabaseUrl(connectionString);
  const sslMode = parsed.url.searchParams.get("sslmode");
  const environment = {
    ...process.env,
    PGCONNECT_TIMEOUT: "10",
    PGDATABASE: databaseName ?? parsed.databaseName,
    PGHOST: parsed.url.hostname,
    PGPASSWORD: decodeURIComponent(parsed.url.password),
    PGPORT: parsed.url.port || "5432",
    PGUSER: decodeURIComponent(parsed.url.username),
  };

  if (sslMode) environment.PGSSLMODE = sslMode;
  return environment;
}

/**
 * Resolves a PostgreSQL client binary from pg_config with PATH fallback.
 *
 * @param {"pg_dump" | "pg_restore"} binaryName
 * @returns {string}
 */
export function resolvePostgresBinary(binaryName) {
  try {
    const bindir = execFileSync("pg_config", ["--bindir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const candidate = resolve(bindir, binaryName);
    if (existsSync(candidate)) return candidate;
  } catch {
    // PATH fallback below keeps the operator error owned by the command runner.
  }

  return binaryName;
}

/**
 * Opens one PostgreSQL client and guarantees connection cleanup.
 *
 * @template Result
 * @param {string} connectionString
 * @param {(client: InstanceType<typeof Client>) => Promise<Result>} callback
 * @returns {Promise<Result>}
 */
export async function withPostgresClient(connectionString, callback) {
  const client = new Client({
    application_name: "realize-migration-adoption",
    connectionString,
  });
  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

/**
 * Creates one validated empty probe database and refuses pre-existing targets.
 *
 * @param {string} adminConnectionString
 * @param {string} databaseName
 * @param {string} ownerName
 * @returns {Promise<void>}
 */
export async function createTemporaryDatabase(
  adminConnectionString,
  databaseName,
  ownerName,
) {
  assertTemporaryDatabaseName(databaseName);

  await withPostgresClient(adminConnectionString, async (client) => {
    const existing = await client.query(
      "SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1",
      [databaseName],
    );
    if (existing.rows.length > 0) {
      throw new Error(`Temporary database already exists: ${databaseName}`);
    }

    await client.query(
      `CREATE DATABASE ${quoteIdentifier(databaseName)} OWNER ${quoteIdentifier(ownerName)} TEMPLATE template0 ENCODING 'UTF8'`,
    );
  });
}

/**
 * Drops only an exact validated probe database after terminating its sessions.
 *
 * @param {string} adminConnectionString
 * @param {string} databaseName
 * @returns {Promise<void>}
 */
export async function dropTemporaryDatabase(
  adminConnectionString,
  databaseName,
) {
  assertTemporaryDatabaseName(databaseName);

  await withPostgresClient(adminConnectionString, async (client) => {
    await client.query(
      `
        SELECT pg_catalog.pg_terminate_backend(pid)
        FROM pg_catalog.pg_stat_activity
        WHERE datname = $1 AND pid <> pg_catalog.pg_backend_pid()
      `,
      [databaseName],
    );
    await client.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
    );
  });
}
