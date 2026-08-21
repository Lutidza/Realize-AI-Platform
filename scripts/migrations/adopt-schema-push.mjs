/**
 * @file scripts/migrations/adopt-schema-push.mjs
 * @version 2026-08-17
 * @description Orchestrates backup, restore, schema proof and guarded Payload history adoption.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnvironment } from "dotenv";

import { runCommand } from "./command-runner.mjs";
import {
  adoptMigrationHistory,
  planMigrationHistory,
  readExpectedMigrationNames,
  readMigrationHistory,
} from "./migration-history.mjs";
import {
  createTemporaryDatabase,
  databaseNameFromUrl,
  databaseUserFromUrl,
  databaseUrlFor,
  dropTemporaryDatabase,
  postgresEnvironment,
  resolvePostgresBinary,
  withPostgresClient,
} from "./postgres-runtime.mjs";
import {
  canonicalizeSchemaSnapshot,
  captureSchemaSnapshot,
  compareSchemaSnapshots,
} from "./schema-evidence.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const payloadBinary = resolve(repositoryRoot, "node_modules/payload/bin.js");
const runtimeRoot = resolve(repositoryRoot, ".runtime/migration-adoption");

loadEnvironment({
  override: false,
  path: resolve(repositoryRoot, ".env"),
  quiet: true,
});

function parseOptions(args) {
  const supported = new Set(["--apply", "--help", "--keep-temp"]);
  const unknown = args.filter((argument) => !supported.has(argument));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.join(", ")}`);
  }

  return {
    apply: args.includes("--apply"),
    help: args.includes("--help"),
    keepTemporaryDatabases: args.includes("--keep-temp"),
  };
}

function printHelp() {
  console.log(
    `
Usage:
  npm run payload:migrate:adopt:verify
  REALIZE_MIGRATION_ADOPTION_WRITES_STOPPED=true \\
  REALIZE_MIGRATION_ADOPTION_CONFIRM=<database> \\
  npm run payload:migrate:adopt:apply

Default mode backs up the target, restores a clone, builds a fresh migration
reference, compares semantic schemas, adopts only the clone and proves that the
normal Payload migration command is a no-op. --apply repeats the proof and then
updates target migration metadata transactionally.
  `.trim(),
  );
}

function createRunId() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `${timestamp}_${randomBytes(3).toString("hex")}`;
}

function safeFileSegment(value) {
  const segment = value.replace(/[^a-zA-Z0-9_.-]+/g, "_");
  return segment || "database";
}

function ensurePrivateDirectory(path) {
  mkdirSync(path, { mode: 0o700, recursive: true });
  chmodSync(path, 0o700);
}

function writePrivateJson(path, value) {
  ensurePrivateDirectory(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function writePrivateText(path, value) {
  ensurePrivateDirectory(dirname(path));
  writeFileSync(path, value, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sensitiveValues(connectionString) {
  const values = [];

  try {
    values.push(decodeURIComponent(new URL(connectionString).password));
  } catch {
    // URL validation is owned by postgres-runtime and produces the final error.
  }

  for (const [name, value] of Object.entries(process.env)) {
    if (/(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY)$/i.test(name) && value) {
      values.push(value);
    }
  }

  return Array.from(new Set(values.filter(Boolean)));
}

async function runPayloadMigrations(connectionString, logPath, secrets) {
  const environment = {
    ...process.env,
    CI: "1",
    DATABASE_URI: connectionString,
    DATABASE_URL: connectionString,
    NODE_ENV: "production",
    NODE_OPTIONS: "--no-deprecation",
  };
  const result = await runCommand(
    process.execPath,
    [payloadBinary, "migrate"],
    {
      cwd: repositoryRoot,
      env: environment,
      secrets,
      timeoutMs: 240_000,
    },
  );
  writePrivateText(logPath, `${result.stdout}${result.stderr}`);
  return result;
}

async function captureSnapshot(connectionString) {
  return withPostgresClient(connectionString, (client) =>
    captureSchemaSnapshot(client),
  );
}

async function captureHistory(connectionString) {
  return withPostgresClient(connectionString, (client) =>
    readMigrationHistory(client),
  );
}

async function adoptHistory(connectionString, expectedMigrations) {
  return withPostgresClient(connectionString, (client) =>
    adoptMigrationHistory(client, expectedMigrations),
  );
}

function assertEqualSchemas(comparison, context) {
  if (comparison.equal) return;
  const changedCategories = comparison.differences
    .map((difference) => difference.category)
    .join(", ");
  throw new Error(
    `${context} schemas differ${changedCategories ? ` in: ${changedCategories}` : ""}.`,
  );
}

function assertHistoryUnchanged(before, after, context) {
  const compact = (rows) =>
    rows.map(({ batch, name }) => ({ batch: Number(batch), name }));
  if (JSON.stringify(compact(before)) !== JSON.stringify(compact(after))) {
    throw new Error(`${context} changed migration history unexpectedly.`);
  }
}

function assertApplyGuards(options, targetDatabase) {
  if (!options.apply) return;

  if (process.env.REALIZE_MIGRATION_ADOPTION_WRITES_STOPPED !== "true") {
    throw new Error(
      "--apply requires REALIZE_MIGRATION_ADOPTION_WRITES_STOPPED=true after stopping all writes.",
    );
  }

  if (process.env.REALIZE_MIGRATION_ADOPTION_CONFIRM !== targetDatabase) {
    throw new Error(
      `--apply requires REALIZE_MIGRATION_ADOPTION_CONFIRM=${targetDatabase}.`,
    );
  }
}

async function createVerifiedBackup({
  backupPath,
  expectedMigrations,
  pgDump,
  pgRestore,
  runDirectory,
  secrets,
  targetDatabase,
  targetUrl,
}) {
  console.log(`[migration-adoption] Creating backup for ${targetDatabase}.`);
  await runCommand(
    pgDump,
    ["--format=custom", "--no-password", "--file", backupPath],
    {
      cwd: repositoryRoot,
      env: postgresEnvironment(targetUrl),
      secrets,
      timeoutMs: 240_000,
    },
  );
  chmodSync(backupPath, 0o600);

  const restoreList = await runCommand(pgRestore, ["--list", backupPath], {
    cwd: repositoryRoot,
    env: postgresEnvironment(targetUrl),
    secrets,
  });
  writePrivateText(
    resolve(runDirectory, "backup-restore-list.txt"),
    restoreList.stdout,
  );

  const restoreListEntries = restoreList.stdout
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith(";")).length;
  if (
    restoreListEntries === 0 ||
    !restoreList.stdout.includes("payload_migrations")
  ) {
    throw new Error(
      "Backup restore list is empty or lacks payload_migrations.",
    );
  }

  const manifest = {
    backupFile: relative(repositoryRoot, backupPath),
    bytes: statSync(backupPath).size,
    createdAt: new Date().toISOString(),
    expectedMigrations,
    restoreListEntries,
    sha256: hashFile(backupPath),
    sourceDatabase: targetDatabase,
  };
  writePrivateJson(`${backupPath}.manifest.json`, manifest);
  return manifest;
}

async function restoreBackup({
  backupPath,
  cloneDatabase,
  pgRestore,
  secrets,
  targetUrl,
}) {
  console.log(
    `[migration-adoption] Restoring verified clone ${cloneDatabase}.`,
  );
  await runCommand(
    pgRestore,
    [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--no-password",
      "--dbname",
      cloneDatabase,
      backupPath,
    ],
    {
      cwd: repositoryRoot,
      env: postgresEnvironment(targetUrl, cloneDatabase),
      secrets,
      timeoutMs: 240_000,
    },
  );
}

async function verifyCloneAdoption({
  cloneUrl,
  expectedMigrations,
  referenceSnapshot,
  runDirectory,
  secrets,
}) {
  const historyBefore = await captureHistory(cloneUrl);
  const historyPlan = planMigrationHistory(historyBefore, expectedMigrations);
  if (historyPlan.state !== "adopt") {
    throw new Error(
      `Restored clone must require adoption; received ${historyPlan.state}.`,
    );
  }

  const adoption = await adoptHistory(cloneUrl, expectedMigrations);
  if (adoption.state !== "adopted") {
    throw new Error(
      `Clone adoption returned unexpected state: ${adoption.state}.`,
    );
  }

  const historyBeforeNoop = await captureHistory(cloneUrl);
  await runPayloadMigrations(
    cloneUrl,
    resolve(runDirectory, "clone-migrate-noop.log"),
    secrets,
  );
  const historyAfterNoop = await captureHistory(cloneUrl);
  assertHistoryUnchanged(
    historyBeforeNoop,
    historyAfterNoop,
    "Clone no-op migration",
  );
  planMigrationHistory(historyAfterNoop, expectedMigrations);

  const snapshotAfterNoop = await captureSnapshot(cloneUrl);
  const comparisonAfterNoop = compareSchemaSnapshots(
    snapshotAfterNoop,
    referenceSnapshot,
  );
  assertEqualSchemas(comparisonAfterNoop, "Post-adoption clone/reference");

  return {
    adoptionState: adoption.state,
    historyAfterNoop,
    schemaHash: comparisonAfterNoop.leftHash,
  };
}

async function applyTargetAdoption({
  expectedMigrations,
  referenceSnapshot,
  runDirectory,
  secrets,
  targetUrl,
}) {
  const snapshotBefore = await captureSnapshot(targetUrl);
  const comparisonBefore = compareSchemaSnapshots(
    snapshotBefore,
    referenceSnapshot,
  );
  assertEqualSchemas(comparisonBefore, "Target/reference before adoption");

  const historyBefore = await captureHistory(targetUrl);
  planMigrationHistory(historyBefore, expectedMigrations);
  const adoption = await adoptHistory(targetUrl, expectedMigrations);
  const historyBeforeNoop = await captureHistory(targetUrl);

  await runPayloadMigrations(
    targetUrl,
    resolve(runDirectory, "target-migrate-noop.log"),
    secrets,
  );
  const historyAfterNoop = await captureHistory(targetUrl);
  assertHistoryUnchanged(
    historyBeforeNoop,
    historyAfterNoop,
    "Target no-op migration",
  );
  planMigrationHistory(historyAfterNoop, expectedMigrations);

  const snapshotAfter = await captureSnapshot(targetUrl);
  const comparisonAfter = compareSchemaSnapshots(
    snapshotAfter,
    referenceSnapshot,
  );
  assertEqualSchemas(comparisonAfter, "Target/reference after adoption");

  return {
    adoptionState: adoption.state,
    historyAfterNoop,
    schemaHash: comparisonAfter.leftHash,
  };
}

/**
 * Runs the complete proof and optionally performs the guarded target mutation.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const targetUrl = process.env.DATABASE_URI || process.env.DATABASE_URL;
  if (!targetUrl) {
    throw new Error("DATABASE_URI or DATABASE_URL is required.");
  }

  const targetDatabase = databaseNameFromUrl(targetUrl);
  const targetDatabaseOwner = databaseUserFromUrl(targetUrl);
  assertApplyGuards(options, targetDatabase);

  const expectedMigrations = readExpectedMigrationNames({
    migrationsDirectory: resolve(repositoryRoot, "src/migrations"),
    migrationsIndexPath: resolve(repositoryRoot, "src/migrations/index.ts"),
  });
  const runId = createRunId();
  const cloneDatabase = `realize_adopt_clone_${runId}`;
  const referenceDatabase = `realize_adopt_ref_${runId}`;
  const adminUrl =
    process.env.MIGRATION_ADOPTION_ADMIN_DATABASE_URI || targetUrl;
  const cloneUrl = databaseUrlFor(targetUrl, cloneDatabase);
  const referenceUrl = databaseUrlFor(targetUrl, referenceDatabase);
  const runDirectory = resolve(runtimeRoot, "runs", runId);
  const backupDirectory = resolve(runtimeRoot, "backups");
  const backupPath = resolve(
    backupDirectory,
    `${safeFileSegment(targetDatabase)}-${runId}.dump`,
  );
  const pgDump = resolvePostgresBinary("pg_dump");
  const pgRestore = resolvePostgresBinary("pg_restore");
  const secrets = sensitiveValues(targetUrl);
  const createdDatabases = [];

  ensurePrivateDirectory(runDirectory);
  ensurePrivateDirectory(backupDirectory);
  console.log(
    `[migration-adoption] Mode=${options.apply ? "apply" : "verify"}; target=${targetDatabase}.`,
  );

  try {
    const backup = await createVerifiedBackup({
      backupPath,
      expectedMigrations,
      pgDump,
      pgRestore,
      runDirectory,
      secrets,
      targetDatabase,
      targetUrl,
    });

    await createTemporaryDatabase(adminUrl, cloneDatabase, targetDatabaseOwner);
    createdDatabases.push(cloneDatabase);
    await restoreBackup({
      backupPath,
      cloneDatabase,
      pgRestore,
      secrets,
      targetUrl,
    });

    await createTemporaryDatabase(
      adminUrl,
      referenceDatabase,
      targetDatabaseOwner,
    );
    createdDatabases.push(referenceDatabase);
    console.log(
      `[migration-adoption] Applying named migrations to ${referenceDatabase}.`,
    );
    await runPayloadMigrations(
      referenceUrl,
      resolve(runDirectory, "reference-migrate.log"),
      secrets,
    );

    const referenceHistory = await captureHistory(referenceUrl);
    const referencePlan = planMigrationHistory(
      referenceHistory,
      expectedMigrations,
    );
    if (referencePlan.state !== "already-adopted") {
      throw new Error(
        "Fresh reference did not produce complete migration history.",
      );
    }

    const cloneSnapshot = await captureSnapshot(cloneUrl);
    const referenceSnapshot = await captureSnapshot(referenceUrl);
    writePrivateJson(
      resolve(runDirectory, "clone-schema.json"),
      canonicalizeSchemaSnapshot(cloneSnapshot),
    );
    writePrivateJson(
      resolve(runDirectory, "reference-schema.json"),
      canonicalizeSchemaSnapshot(referenceSnapshot),
    );

    const comparison = compareSchemaSnapshots(cloneSnapshot, referenceSnapshot);
    writePrivateJson(
      resolve(runDirectory, "schema-comparison.json"),
      comparison,
    );
    assertEqualSchemas(comparison, "Restored clone/fresh reference");
    console.log(
      `[migration-adoption] Semantic schemas match: ${comparison.leftHash}.`,
    );

    const cloneVerification = await verifyCloneAdoption({
      cloneUrl,
      expectedMigrations,
      referenceSnapshot,
      runDirectory,
      secrets,
    });
    console.log(
      "[migration-adoption] Clone adoption and normal migration no-op passed.",
    );

    let targetResult = null;
    if (options.apply) {
      targetResult = await applyTargetAdoption({
        expectedMigrations,
        referenceSnapshot,
        runDirectory,
        secrets,
        targetUrl,
      });
      console.log("[migration-adoption] Target history adoption passed.");
    }

    const result = {
      backup,
      cloneVerification,
      completedAt: new Date().toISOString(),
      expectedMigrations,
      mode: options.apply ? "apply" : "verify",
      schemaComparison: {
        counts: comparison.counts,
        hash: comparison.leftHash,
      },
      schemaVersion: 1,
      status: "passed",
      targetDatabase,
      targetMutation: options.apply ? "migration-history-adopted" : "none",
      targetResult,
    };
    const resultPath = resolve(runDirectory, "result.json");
    writePrivateJson(resultPath, result);
    console.log(
      `[migration-adoption] PASS; evidence=${relative(repositoryRoot, resultPath)}.`,
    );
  } finally {
    if (options.keepTemporaryDatabases) {
      if (createdDatabases.length > 0) {
        console.log(
          `[migration-adoption] Preserved probes: ${createdDatabases.join(", ")}.`,
        );
      }
    } else {
      for (const databaseName of createdDatabases.reverse()) {
        await dropTemporaryDatabase(adminUrl, databaseName);
        console.log(`[migration-adoption] Dropped probe ${databaseName}.`);
      }
    }
  }
}

main().catch((error) => {
  console.error(`[migration-adoption] FAILED: ${error.message}`);
  process.exitCode = 1;
});
