// @vitest-environment node
/**
 * @file tests/int/preview-database-sanitization.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет SQL-контракт очистки preview-клона и удаление неготовой копии при сбоях без подключения к PostgreSQL.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clonePreviewDatabase } from "../../services/ai-execution-worker/src/previewDatabase";

type PoolFixture = {
  database: string;
  query: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  pools: [] as PoolFixture[],
  tables: [] as string[],
  failCreate: false,
  failSanitize: false,
}));

vi.mock("node:child_process", () => ({ execFile: mocks.execFile }));
vi.mock("pg", () => ({
  Pool: vi.fn(function (options: { connectionString: string }) {
    const database = new URL(options.connectionString).pathname.slice(1);
    const pool: PoolFixture = {
      database,
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(async (sql: string, parameters?: unknown[]) => {
        if (database === "source_database") {
          throw new Error("The sanitizer must never connect to the source.");
        }
        if (sql.startsWith("CREATE DATABASE") && mocks.failCreate) {
          throw new Error("fixture create failure");
        }
        if (sql.includes("LIKE 'realize_ai_%'")) {
          return { rows: [{ table_name: "realize_ai_runs" }] };
        }
        if (sql.includes("table_name = ANY")) {
          const requested = parameters?.[0] as string[];
          return {
            rows: mocks.tables
              .filter((name) => requested.includes(name))
              .sort()
              .map((table_name) => ({ table_name })),
          };
        }
        if (
          mocks.failSanitize &&
          sql.startsWith("TRUNCATE TABLE") &&
          sql.includes('"access_credentials"')
        ) {
          throw new Error("fixture sanitizer failure");
        }
        if (sql.includes("table_name = 'users'")) {
          return {
            rows: ["id", "email", "hash", "salt"].map((column_name) => ({
              column_name,
            })),
          };
        }
        if (sql.includes("table_name = 'forms_emails'")) {
          return { rows: [{ column_name: "email_to" }] };
        }
        return { rows: [] };
      }),
    };
    mocks.pools.push(pool);
    return pool;
  }),
}));

const sourceURL = "postgresql://fixture:fixture@127.0.0.1:5432/source_database";
const cloneName = "realize_ai_preview_fixture";
const roots: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pools.length = 0;
  mocks.tables = [
    "access_credentials",
    "access_device_requests",
    "access_refresh_history",
    "access_rate_limits",
    "realize_ai_runs",
    "users_sessions",
  ];
  mocks.failCreate = false;
  mocks.failSanitize = false;
  mocks.execFile.mockImplementation(
    (
      _binary: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout?: string, stderr?: string) => void,
    ) => callback(null, "", ""),
  );
});

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function fixture() {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "realize-preview-db-"));
  roots.push(runtimeRoot);
  const dumpPath = join(runtimeRoot, `${cloneName}.dump`);
  await writeFile(dumpPath, "fixture dump");
  return {
    dumpPath,
    run: () =>
      clonePreviewDatabase({
        databaseName: cloneName,
        databaseURL: sourceURL,
        runtimeRoot,
      }),
  };
}

function poolFor(database: string): PoolFixture {
  const pool = mocks.pools.find((candidate) => candidate.database === database);
  expect(pool, `Expected pool for ${database}`).toBeDefined();
  return pool!;
}

function assertCloneRemoved() {
  const maintenance = poolFor("postgres");
  expect(maintenance.query).toHaveBeenCalledWith(
    expect.stringContaining("WHERE datname = $1 AND pid <> pg_backend_pid()"),
    [cloneName],
  );
  expect(maintenance.query).toHaveBeenCalledWith(
    `DROP DATABASE IF EXISTS "${cloneName}"`,
  );
}

describe("preview database sanitization", () => {
  it("очищает все виды access-состояния только после restore и только в клоне", async () => {
    const f = await fixture();
    expect(await f.run()).toEqual({
      databaseName: cloneName,
      databaseURL: sourceURL.replace("source_database", cloneName),
    });
    expect(mocks.pools.map((pool) => pool.database)).toEqual([
      "postgres",
      cloneName,
    ]);
    const preview = poolFor(cloneName);
    expect(preview.query).toHaveBeenCalledWith(
      'TRUNCATE TABLE "access_credentials", "access_device_requests", "access_rate_limits", "access_refresh_history", "users_sessions" RESTART IDENTITY CASCADE',
    );
    expect(preview.query).toHaveBeenCalledWith(
      'TRUNCATE TABLE "realize_ai_runs" RESTART IDENTITY CASCADE',
    );
    expect(preview.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE users SET email = 'preview-user-'"),
    );
    expect(preview.query).toHaveBeenCalledWith(
      "UPDATE forms_emails SET \"email_to\" = 'disabled@invalid.example'",
    );
    expect(mocks.execFile.mock.calls.map(([binary]) => binary)).toEqual([
      "pg_dump",
      "pg_restore",
    ]);
    expect(mocks.execFile.mock.calls[0][1]).toContain("source_database");
    expect(mocks.execFile.mock.calls[1][1]).toEqual([
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      "--dbname",
      cloneName,
      f.dumpPath,
    ]);
    expect(mocks.execFile.mock.invocationCallOrder[1]).toBeLessThan(
      preview.query.mock.invocationCallOrder[0],
    );
    expect(poolFor("postgres").query).toHaveBeenCalledTimes(1);
    for (const pool of mocks.pools) expect(pool.end).toHaveBeenCalledOnce();
    await expect(readFile(f.dumpPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("поддерживает схему до access migration и очищает существующие сессии", async () => {
    mocks.tables = ["realize_ai_runs", "users_sessions"];
    const f = await fixture();
    await f.run();
    const sql = poolFor(cloneName).query.mock.calls.map(
      ([statement]) => statement,
    );
    const truncations = sql.filter((statement) =>
      statement.startsWith("TRUNCATE"),
    );
    expect(truncations).toEqual([
      'TRUNCATE TABLE "realize_ai_runs" RESTART IDENTITY CASCADE',
      'TRUNCATE TABLE "users_sessions" RESTART IDENTITY CASCADE',
    ]);
  });

  it("при отказе очистки не выдаёт клон и удаляет только созданную preview-базу", async () => {
    mocks.failSanitize = true;
    const f = await fixture();
    await expect(f.run()).rejects.toThrow("fixture sanitizer failure");
    assertCloneRemoved();
    expect(mocks.pools.map((pool) => pool.database)).toEqual([
      "postgres",
      cloneName,
    ]);
    expect(poolFor(cloneName).query).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE users"),
    );
    for (const pool of mocks.pools) expect(pool.end).toHaveBeenCalledOnce();
    await expect(readFile(f.dumpPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("при отказе restore удаляет созданный клон без запуска sanitizer", async () => {
    mocks.execFile.mockImplementationOnce(
      (_binary, _args, _options, callback) => callback(null, "", ""),
    );
    mocks.execFile.mockImplementationOnce(
      (_binary, _args, _options, callback) =>
        callback(new Error("fixture restore failure")),
    );
    const f = await fixture();
    await expect(f.run()).rejects.toThrow("fixture restore failure");
    assertCloneRemoved();
    expect(mocks.pools.map((pool) => pool.database)).toEqual(["postgres"]);
    expect(poolFor("postgres").end).toHaveBeenCalledOnce();
    await expect(readFile(f.dumpPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("не удаляет базу, если CREATE DATABASE не завершился успешно", async () => {
    mocks.failCreate = true;
    const f = await fixture();
    await expect(f.run()).rejects.toThrow("fixture create failure");
    expect(mocks.pools.map((pool) => pool.database)).toEqual(["postgres"]);
    expect(poolFor("postgres").query).toHaveBeenCalledTimes(1);
    expect(mocks.execFile).toHaveBeenCalledTimes(1);
    expect(poolFor("postgres").end).toHaveBeenCalledOnce();
    await expect(readFile(f.dumpPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
