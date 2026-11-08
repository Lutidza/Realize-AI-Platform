/**
 * @file packages/engineering-runtime/src/storage/openEngineeringStore.repository.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Сохраняет атомарный CAS журнал SQLite и предоставляет короткие workspace leases.
 * @see documentation/architecture/engineering-operations.md
 */
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { acquireGitLock } from "@realize/git-runtime";
import { StorageError } from "./Storage.error.ts";
import { openPrivateStorage } from "./openPrivateStorage.adapter.ts";
import { createFinishCapacity } from "./createFinishCapacity.repository.ts";
import type {
  EngineeringStore,
  EventInput,
  OpenEngineeringStoreInput,
  StorageBinding,
  StorageLimits,
  StorageTransaction,
  StorageTransactionOptions,
  StoredOperation,
  StoredRequest,
} from "./EngineeringStorage.types.ts";

const DEFAULT_LIMITS: StorageLimits = {
  maxPayloadBytes: 1_048_576,
  maxOperations: 100_000,
  maxRequests: 100_000,
  maxEvents: 100_000,
  maxDatabaseBytes: 1_073_741_824,
};
const HARD_LIMITS: StorageLimits = {
  maxPayloadBytes: 1_048_576,
  maxOperations: 1_000_000,
  maxRequests: 1_000_000,
  maxEvents: 1_000_000,
  maxDatabaseBytes: 21_474_836_480,
};

function validateText(value: unknown, maximum = 256): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.includes("\0") ||
    Buffer.byteLength(value) > maximum
  )
    throw new StorageError(
      "INVALID_INPUT",
      "Journal field должен быть непустой ограниченной строкой.",
    );
}

function serializePayload(payload: unknown, maximum: number): string {
  const seen = new Set<object>();
  let entries = 0;
  let minimumBytes = 0;
  function visit(value: unknown, depth: number): void {
    if (++entries > 100_000 || depth > 64)
      throw new StorageError(
        "LIMIT_EXCEEDED",
        "Payload превышает предел вложенности или элементов.",
      );
    minimumBytes += typeof value === "string" ? Buffer.byteLength(value) : 1;
    if (minimumBytes > maximum)
      throw new StorageError(
        "LIMIT_EXCEEDED",
        "Payload превышает лимит bytes.",
      );
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object" || seen.has(value))
      throw new StorageError(
        "INVALID_INPUT",
        "Payload должен содержать только конечные JSON values.",
      );
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new StorageError(
        "INVALID_INPUT",
        "Payload должен содержать plain JSON objects.",
      );
    seen.add(value);
    if (!Array.isArray(value)) {
      for (const key of Object.keys(value))
        minimumBytes += Buffer.byteLength(key);
      if (minimumBytes > maximum)
        throw new StorageError(
          "LIMIT_EXCEEDED",
          "Payload превышает лимит bytes.",
        );
    }
    for (const child of Array.isArray(value) ? value : Object.values(value))
      visit(child, depth + 1);
    seen.delete(value);
  }
  visit(payload, 0);
  const result = JSON.stringify(payload);
  if (Buffer.byteLength(result) > maximum)
    throw new StorageError("LIMIT_EXCEEDED", "Payload превышает лимит bytes.");
  return result;
}

function storageFailure(error: unknown): never {
  if (error instanceof StorageError) throw error;
  const code = (error as { errcode?: number; code?: string })?.errcode;
  if (
    code === 5 ||
    code === 6 ||
    code === 19 ||
    (typeof code === "number" && (code & 255) === 19)
  )
    throw new StorageError(
      "CONFLICT",
      "Journal занят или durable identity конфликтует.",
    );
  if (code === 13)
    throw new StorageError(
      "LIMIT_EXCEEDED",
      "SQLite достиг лимита private storage.",
    );
  throw new StorageError(
    "INTERNAL_ERROR",
    "Не удалось выполнить операцию private journal.",
  );
}

function freezeClone<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeClone(child);
    Object.freeze(value);
  }
  return value;
}

/** FULL + rollback journal фиксируют key, revision и event одной SQLite transaction. */
export function openEngineeringStore(
  input: OpenEngineeringStoreInput,
): EngineeringStore {
  for (const id of [input.installationId, input.workspaceId, input.targetId])
    validateText(id);
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  for (const key of Object.keys(HARD_LIMITS) as (keyof StorageLimits)[])
    if (
      !Number.isSafeInteger(limits[key]) ||
      limits[key] < 1 ||
      limits[key] > HARD_LIMITS[key]
    )
      throw new StorageError(
        "INVALID_INPUT",
        "Storage limits выходят за допустимые hard bounds.",
      );
  if (limits.maxDatabaseBytes < 65_536)
    throw new StorageError(
      "INVALID_INPUT",
      "SQLite требует не менее 64 KiB private storage.",
    );
  const paths = openPrivateStorage(input.stateDirectory, input.checkoutRoot);
  let database!: DatabaseSync;
  let binding: StorageBinding;
  try {
    database = new DatabaseSync(paths.databasePath, { timeout: 0 });
    database.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA trusted_schema = OFF;",
    );
    const pageSize = Number(
      database.prepare("PRAGMA page_size").get()?.page_size,
    );
    database.exec(
      `PRAGMA max_page_count = ${Math.floor(limits.maxDatabaseBytes / pageSize)}; BEGIN IMMEDIATE;`,
    );
    database.exec(`
      CREATE TABLE IF NOT EXISTS binding (id INTEGER PRIMARY KEY CHECK(id = 1), schema_version INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations (
        operation_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision >= 0),
        workspace_id TEXT NOT NULL, state TEXT NOT NULL,
        write_block TEXT CHECK(write_block IS NULL OR write_block IN ('fs_unresolved','writer_unconfirmed')),
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS requests (
        key TEXT PRIMARY KEY, hash TEXT NOT NULL, operation_id TEXT NOT NULL REFERENCES operations(operation_id)
      );
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL REFERENCES operations(operation_id),
        revision INTEGER NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL,
        attempt INTEGER, manifest_ref TEXT
      );
      CREATE TABLE IF NOT EXISTS finish_reservations (
        operation_id TEXT PRIMARY KEY REFERENCES operations(operation_id),
        events INTEGER NOT NULL CHECK(events >= 0), bytes INTEGER NOT NULL CHECK(bytes >= 0),
        requests INTEGER NOT NULL CHECK(requests >= 0)
      );
      CREATE INDEX IF NOT EXISTS blocked_operations ON operations(write_block) WHERE write_block IS NOT NULL;
    `);
    const expected = {
      installationId: input.installationId,
      workspaceId: input.workspaceId,
      targetId: input.targetId,
      canonicalRoot: paths.canonicalRoot,
      rootIdentity: paths.rootIdentity,
    };
    const existing = database
      .prepare("SELECT schema_version, payload FROM binding WHERE id = 1")
      .get();
    if (existing) {
      binding = JSON.parse(String(existing.payload)) as StorageBinding;
      if (
        existing.schema_version !== 1 ||
        binding.installationId !== expected.installationId ||
        binding.workspaceId !== expected.workspaceId ||
        binding.targetId !== expected.targetId ||
        binding.canonicalRoot !== expected.canonicalRoot ||
        binding.rootIdentity.dev !== expected.rootIdentity.dev ||
        binding.rootIdentity.ino !== expected.rootIdentity.ino ||
        typeof binding.epoch !== "string"
      )
        throw new StorageError(
          "CONFLICT",
          "Private journal уже связан с другой identity или schema.",
        );
    } else {
      binding = { ...expected, epoch: randomUUID() };
      database
        .prepare("INSERT INTO binding VALUES (1, 1, ?)")
        .run(JSON.stringify(binding));
    }
    paths.assertCurrent();
    database.exec("COMMIT");
  } catch (error) {
    try {
      database?.close();
    } finally {
      paths.close();
    }
    storageFailure(error);
  }

  let closed = false;
  let inTransaction = false;
  let activeLeases = 0;
  const capacity = createFinishCapacity(database, limits);
  function assertOpen() {
    if (closed)
      throw new StorageError("CONFLICT", "Private journal уже закрыт.");
    paths.assertCurrent();
  }
  function getOperation(operationId: string): StoredOperation | null {
    assertOpen();
    validateText(operationId);
    const row = database
      .prepare("SELECT * FROM operations WHERE operation_id = ?")
      .get(operationId);
    return row
      ? freezeClone({
          operationId: String(row.operation_id),
          revision: Number(row.revision),
          workspaceId: String(row.workspace_id),
          state: String(row.state),
          writeBlock: row.write_block as StoredOperation["writeBlock"],
          payload: JSON.parse(String(row.payload)),
        })
      : null;
  }
  function getRequest(key: string): StoredRequest | null {
    assertOpen();
    validateText(key, 4096);
    const row = database
      .prepare("SELECT * FROM requests WHERE key = ?")
      .get(key);
    return row
      ? Object.freeze({
          key: String(row.key),
          hash: String(row.hash),
          operationId: String(row.operation_id),
        })
      : null;
  }
  function checkCount(
    table: "operations" | "requests" | "events",
    limit: number,
  ) {
    if (
      Number(
        database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count,
      ) >= limit
    )
      throw new StorageError(
        "LIMIT_EXCEEDED",
        "Journal quota исчерпана; durable identities сохраняются.",
      );
  }
  function operationValues(operation: StoredOperation) {
    validateText(operation.operationId);
    validateText(operation.state);
    if (
      operation.workspaceId !== binding.workspaceId ||
      !Number.isSafeInteger(operation.revision) ||
      operation.revision < 0 ||
      ![null, "fs_unresolved", "writer_unconfirmed"].includes(
        operation.writeBlock,
      )
    )
      throw new StorageError(
        "INVALID_INPUT",
        "Operation identity, revision или writeBlock недопустимы.",
      );
    return [
      operation.revision,
      operation.workspaceId,
      operation.state,
      operation.writeBlock,
      serializePayload(operation.payload, limits.maxPayloadBytes),
      operation.operationId,
    ];
  }

  return {
    binding: freezeClone(binding),
    getOperation,
    getRequest,
    transaction<T>(
      callback: (transaction: StorageTransaction) => T,
      options: StorageTransactionOptions = {},
    ): T {
      assertOpen();
      const finishOperationId = options.finishOperationId;
      if (finishOperationId !== undefined) validateText(finishOperationId);
      const assertFinishOwner = (operationId: string) => {
        if (
          finishOperationId !== undefined &&
          operationId !== finishOperationId
        )
          throw new StorageError(
            "CONFLICT",
            "Finish transaction может изменять только собственную operation.",
          );
      };
      if (inTransaction)
        throw new StorageError(
          "CONFLICT",
          "Вложенная journal transaction запрещена.",
        );
      inTransaction = true;
      let active = true;
      let begun = false;
      const checkActive = () => {
        if (!active)
          throw new StorageError(
            "CONFLICT",
            "Transaction handle уже завершён.",
          );
        assertOpen();
      };
      const transaction: StorageTransaction = {
        getOperation(id) {
          checkActive();
          return getOperation(id);
        },
        getRequest(key) {
          checkActive();
          return getRequest(key);
        },
        insertOperation(operation) {
          checkActive();
          if (finishOperationId !== undefined)
            throw new StorageError(
              "CONFLICT",
              "Finish transaction не создаёт новую operation.",
            );
          const values = operationValues(operation);
          checkCount("operations", limits.maxOperations);
          database
            .prepare(
              "INSERT INTO operations (revision,workspace_id,state,write_block,payload,operation_id) VALUES (?,?,?,?,?,?)",
            )
            .run(...values);
        },
        replaceOperation(operation, expectedRevision) {
          checkActive();
          assertFinishOwner(operation.operationId);
          if (
            !Number.isSafeInteger(expectedRevision) ||
            expectedRevision < 0 ||
            operation.revision !== expectedRevision + 1
          )
            throw new StorageError(
              "CONFLICT",
              "Следующая revision должна быть expectedRevision + 1.",
            );
          const values = operationValues(operation);
          if (finishOperationId !== undefined) {
            const previousBytes = Number(
              database
                .prepare(
                  "SELECT length(CAST(payload AS BLOB)) AS bytes FROM operations WHERE operation_id=?",
                )
                .get(operation.operationId)?.bytes ?? 0,
            );
            capacity.consume(
              finishOperationId,
              "bytes",
              Math.max(0, Buffer.byteLength(String(values[4])) - previousBytes),
            );
          }
          const result = database
            .prepare(
              "UPDATE operations SET revision=?,workspace_id=?,state=?,write_block=?,payload=? WHERE operation_id=? AND revision=?",
            )
            .run(...values, expectedRevision);
          if (result.changes !== 1)
            throw new StorageError(
              "CONFLICT",
              "Operation revision изменилась или операция отсутствует.",
            );
        },
        insertRequest(request) {
          checkActive();
          assertFinishOwner(request.operationId);
          validateText(request.key, 4096);
          validateText(request.operationId);
          if (!/^[a-f0-9]{64}$/.test(request.hash))
            throw new StorageError(
              "INVALID_INPUT",
              "Command hash должен быть SHA-256.",
            );
          if (finishOperationId !== undefined)
            capacity.consume(finishOperationId, "requests", 1);
          database
            .prepare(
              "INSERT INTO requests (key,hash,operation_id) VALUES (?,?,?)",
            )
            .run(request.key, request.hash, request.operationId);
        },
        appendEvent(event: EventInput) {
          checkActive();
          assertFinishOwner(event.operationId);
          validateText(event.kind);
          validateText(event.at, 64);
          const attempt = event.attempt ?? null;
          const manifestRef = event.manifestRef ?? null;
          if (
            (attempt !== null &&
              (!Number.isSafeInteger(attempt) || attempt < 0)) ||
            (manifestRef !== null && !/^[a-f0-9]{64}$/.test(manifestRef))
          )
            throw new StorageError(
              "INVALID_INPUT",
              "Event attempt или manifest SHA-256 недопустимы.",
            );
          const operation = getOperation(event.operationId);
          if (!operation || operation.revision !== event.revision)
            throw new StorageError(
              "CONFLICT",
              "Event должен относиться к текущей operation revision.",
            );
          if (finishOperationId !== undefined)
            capacity.consume(finishOperationId, "events", 1);
          const result = database
            .prepare(
              "INSERT INTO events (operation_id,revision,kind,at,attempt,manifest_ref) VALUES (?,?,?,?,?,?)",
            )
            .run(
              event.operationId,
              event.revision,
              event.kind,
              event.at,
              attempt,
              manifestRef,
            );
          return Object.freeze({
            operationId: event.operationId,
            revision: event.revision,
            kind: event.kind,
            at: event.at,
            attempt,
            manifestRef,
            seq: Number(result.lastInsertRowid),
          });
        },
        reserveFinishCapacity(operationId, minimum) {
          checkActive();
          validateText(operationId);
          assertFinishOwner(operationId);
          capacity.reserve(operationId, minimum);
        },
        releaseFinishCapacity(operationId) {
          checkActive();
          validateText(operationId);
          assertFinishOwner(operationId);
          capacity.release(operationId);
        },
      };
      try {
        database.exec("BEGIN IMMEDIATE");
        begun = true;
        const result = callback(transaction);
        if (
          result &&
          (typeof result === "object" || typeof result === "function") &&
          "then" in result
        ) {
          void Promise.resolve(result).catch(() => undefined);
          throw new StorageError(
            "INVALID_INPUT",
            "Journal transaction callback должен быть синхронным.",
          );
        }
        checkActive();
        capacity.assertQuota();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        if (begun && database.isTransaction) database.exec("ROLLBACK");
        // Ошибка пользовательского callback сохраняется; ошибки SQLite не раскрывают private paths.
        if (
          error instanceof Error &&
          !("errcode" in error) &&
          !(error instanceof StorageError)
        )
          throw error;
        storageFailure(error);
      } finally {
        active = false;
        inTransaction = false;
      }
    },
    listEvents({ afterSeq = 0, limit = 100 } = {}) {
      assertOpen();
      if (
        !Number.isSafeInteger(afterSeq) ||
        afterSeq < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 500
      )
        throw new StorageError(
          "INVALID_INPUT",
          "Event cursor или page limit недопустимы.",
        );
      return database
        .prepare("SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT ?")
        .all(afterSeq, limit)
        .map((row) =>
          Object.freeze({
            seq: Number(row.seq),
            operationId: String(row.operation_id),
            revision: Number(row.revision),
            kind: String(row.kind),
            at: String(row.at),
            attempt: row.attempt === null ? null : Number(row.attempt),
            manifestRef:
              row.manifest_ref === null ? null : String(row.manifest_ref),
          }),
        );
    },
    listBlockedOperations() {
      assertOpen();
      const rows = database
        .prepare(
          "SELECT operation_id FROM operations WHERE write_block IS NOT NULL ORDER BY operation_id LIMIT 501",
        )
        .all();
      if (rows.length > 500)
        throw new StorageError(
          "LIMIT_EXCEEDED",
          "Число unresolved operations превышает bounded snapshot.",
        );
      return rows.map((row) => getOperation(String(row.operation_id))!);
    },
    async withWorkspaceLease<T>(
      callback: (lease: { assertHeld(): void }) => Promise<T>,
    ): Promise<T> {
      assertOpen();
      if (inTransaction)
        throw new StorageError(
          "CONFLICT",
          "Lease нельзя ожидать внутри SQL transaction.",
        );
      activeLeases += 1;
      let lease: Awaited<ReturnType<typeof acquireGitLock>> | undefined;
      try {
        try {
          lease = await acquireGitLock(paths.directory);
        } catch (error) {
          if ((error as { code?: string }).code === "repository_locked")
            throw new StorageError(
              "CONFLICT",
              "Workspace kernel lock уже занят.",
            );
          throw new StorageError(
            "UNSUPPORTED",
            "Workspace kernel lock недоступен.",
          );
        }
        const held = lease;
        const exposed = Object.freeze({
          assertHeld() {
            assertOpen();
            try {
              held.assertHeld();
            } catch {
              throw new StorageError(
                "CONFLICT",
                "Workspace kernel lease уже недействителен.",
              );
            }
          },
        });
        exposed.assertHeld();
        const result = await callback(exposed);
        exposed.assertHeld();
        return result;
      } finally {
        try {
          await lease?.release();
        } finally {
          activeLeases -= 1;
        }
      }
    },
    close() {
      if (closed) return;
      if (inTransaction || activeLeases)
        throw new StorageError(
          "CONFLICT",
          "Нельзя закрыть journal с активной transaction или lease.",
        );
      try {
        database.close();
      } finally {
        closed = true;
        paths.close();
      }
    },
  };
}
