/**
 * @file scripts/migrations/migration-history.mjs
 * @version 2026-08-17
 * @description Validates and transactionally adopts Payload migration history.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const migrationNamePattern = /^\d{8}_\d{6}_[a-z0-9_]+$/;

function assertUniqueMigrationNames(names) {
  if (names.length === 0) {
    throw new Error(
      "No named migrations were found in src/migrations/index.ts.",
    );
  }

  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    throw new Error(
      "Migration names in src/migrations/index.ts must be unique.",
    );
  }

  for (const name of names) {
    if (!migrationNamePattern.test(name)) {
      throw new Error(`Unsupported migration name: ${name}`);
    }
  }
}

/**
 * Reads the canonical ordered migration list and verifies source-file coverage.
 *
 * @param {{ migrationsDirectory?: string, migrationsIndexPath?: string }} [options]
 * @returns {string[]} Ordered migration names from the Payload migration index.
 * @throws {Error} When the index and versioned migration files drift.
 */
export function readExpectedMigrationNames(options = {}) {
  const migrationsDirectory = resolve(
    options.migrationsDirectory ?? "src/migrations",
  );
  const migrationsIndexPath = resolve(
    options.migrationsIndexPath ?? `${migrationsDirectory}/index.ts`,
  );
  const indexSource = readFileSync(migrationsIndexPath, "utf8");
  const names = Array.from(
    indexSource.matchAll(/\bname:\s*["']([^"']+)["']/g),
    (match) => match[1],
  );

  assertUniqueMigrationNames(names);

  const indexedFiles = new Set(names.map((name) => `${name}.ts`));
  const versionedFiles = readdirSync(migrationsDirectory).filter((fileName) =>
    /^\d{8}_\d{6}_.+\.ts$/.test(fileName),
  );

  for (const fileName of indexedFiles) {
    if (!existsSync(resolve(migrationsDirectory, fileName))) {
      throw new Error(`Indexed migration source is missing: ${fileName}`);
    }
  }

  const unindexedFiles = versionedFiles.filter(
    (fileName) => !indexedFiles.has(fileName),
  );
  if (unindexedFiles.length > 0) {
    throw new Error(
      `Versioned migration sources are not indexed: ${unindexedFiles.join(", ")}`,
    );
  }

  return names;
}

/**
 * Classifies migration history without guessing how a partial history arose.
 *
 * @param {{ name: string, batch: number | string }[]} existingRows
 * @param {string[]} expectedNames
 * @returns {{ state: "adopt" | "already-adopted" }} Safe history action.
 * @throws {Error} When history is empty, partial, mixed or otherwise unknown.
 */
export function planMigrationHistory(existingRows, expectedNames) {
  assertUniqueMigrationNames(expectedNames);
  const rows = existingRows.map((row) => ({
    batch: Number(row.batch),
    name: row.name,
  }));

  if (rows.length === 1 && rows[0].name === "dev" && rows[0].batch === -1) {
    return { state: "adopt" };
  }

  const namesMatch =
    rows.length === expectedNames.length &&
    rows.every((row, index) => row.name === expectedNames[index]);
  const batchesAreVersioned = rows.every(
    (row) => Number.isInteger(row.batch) && row.batch > 0,
  );

  if (namesMatch && batchesAreVersioned) {
    return { state: "already-adopted" };
  }

  const printableHistory = rows
    .map((row) => `${row.name}/${row.batch}`)
    .join(", ");
  throw new Error(
    `Unsafe migration history state: ${printableHistory || "<empty>"}. ` +
      "Expected exactly dev/-1 or the complete ordered versioned history.",
  );
}

/**
 * Reads Payload migration metadata in insertion order.
 *
 * @param {{ query: (query: string, values?: unknown[]) => Promise<{ rows: { id: number, name: string, batch: number }[] }> }} client
 * @returns {Promise<{ id: number, name: string, batch: number }[]>}
 */
export async function readMigrationHistory(client) {
  const result = await client.query(
    `SELECT id, name, batch FROM public.payload_migrations ORDER BY id ASC`,
  );
  return result.rows;
}

/**
 * Replaces the single Payload dev marker with reviewed versioned history in one
 * locked transaction, or returns an idempotent no-op for adopted databases.
 *
 * @param {{ query: (query: string, values?: unknown[]) => Promise<{ rows: { id: number, name: string, batch: number }[], rowCount?: number | null }> }} client
 * @param {string[]} expectedNames
 * @returns {Promise<{ state: "adopted" | "already-adopted", history: { id: number, name: string, batch: number }[] }>}
 */
export async function adoptMigrationHistory(client, expectedNames) {
  await client.query("BEGIN");

  try {
    await client.query(
      "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext($1))",
      ["realize-e-commerce:migration-adoption"],
    );
    await client.query(
      "LOCK TABLE public.payload_migrations IN ACCESS EXCLUSIVE MODE",
    );

    const before = await readMigrationHistory(client);
    const plan = planMigrationHistory(before, expectedNames);

    if (plan.state === "already-adopted") {
      await client.query("COMMIT");
      return { history: before, state: "already-adopted" };
    }

    const deletion = await client.query(
      `DELETE FROM public.payload_migrations WHERE name = $1 AND batch = $2`,
      ["dev", -1],
    );
    if (deletion.rowCount !== 1) {
      throw new Error(
        `Expected to remove one dev migration marker; removed ${deletion.rowCount ?? 0}.`,
      );
    }

    for (const name of expectedNames) {
      await client.query(
        `
          INSERT INTO public.payload_migrations (name, batch, updated_at, created_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [name, 1],
      );
    }

    const after = await readMigrationHistory(client);
    const verification = planMigrationHistory(after, expectedNames);
    if (verification.state !== "already-adopted") {
      throw new Error("Migration history verification failed after adoption.");
    }

    await client.query("COMMIT");
    return { history: after, state: "adopted" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
