/**
 * @file packages/engineering-runtime/src/storage/createFinishCapacity.repository.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Резервирует quota журнала для finish и recovery уже принятой операции.
 * @see documentation/architecture/engineering-operations.md
 */
import type { DatabaseSync } from "node:sqlite";
import type {
  FinishCapacity,
  StorageLimits,
} from "./EngineeringStorage.types.ts";
import { StorageError } from "./Storage.error.ts";

// Запас на ограниченные поля и SQLite pages учитывается отдельно от payload growth.
const EVENT_RESERVE_BYTES = 4096;
const REQUEST_RESERVE_BYTES = 8192;
const RESERVATION_RESERVE_BYTES = 16_384;

/** Все методы вызываются только внутри journal transaction владельца. */
export function createFinishCapacity(
  database: DatabaseSync,
  limits: StorageLimits,
) {
  const count = (table: "operations" | "requests" | "events") =>
    Number(
      database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count,
    );

  function assertQuota(): void {
    const row = database
      .prepare(
        "SELECT COALESCE(SUM(events),0) AS events, COALESCE(SUM(bytes),0) AS bytes, COALESCE(SUM(requests),0) AS requests, COUNT(*) AS count FROM finish_reservations",
      )
      .get()!;
    if (
      count("operations") > limits.maxOperations ||
      count("requests") + Number(row.requests) > limits.maxRequests ||
      count("events") + Number(row.events) > limits.maxEvents
    )
      throw new StorageError(
        "LIMIT_EXCEEDED",
        "Journal quota зарезервирована для finish/recovery; новые commands не принимаются.",
      );
    const pageSize = Number(
      database.prepare("PRAGMA page_size").get()?.page_size,
    );
    const pages = Number(
      database.prepare("PRAGMA page_count").get()?.page_count,
    );
    const reservedBytes =
      Number(row.bytes) +
      Number(row.events) * EVENT_RESERVE_BYTES +
      Number(row.requests) * REQUEST_RESERVE_BYTES +
      Number(row.count) * RESERVATION_RESERVE_BYTES;
    if (pages * pageSize + reservedBytes > limits.maxDatabaseBytes)
      throw new StorageError(
        "LIMIT_EXCEEDED",
        "SQLite quota недостаточна с учётом finish/recovery reserve.",
      );
  }

  return {
    assertQuota,
    reserve(operationId: string, minimum: FinishCapacity) {
      for (const [key, value] of Object.entries(minimum)) {
        const maximum =
          key === "events"
            ? limits.maxEvents
            : key === "requests"
              ? limits.maxRequests
              : limits.maxDatabaseBytes;
        if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
          throw new StorageError(
            "INVALID_INPUT",
            "Finish reserve должен содержать ограниченные неотрицательные counts/bytes.",
          );
      }
      if (
        [minimum.bytes, minimum.events, minimum.requests].some(
          (value) => !Number.isSafeInteger(value),
        )
      )
        throw new StorageError(
          "INVALID_INPUT",
          "Finish reserve требует events, bytes и requests.",
        );
      database
        .prepare(
          `INSERT INTO finish_reservations(operation_id,events,bytes,requests) VALUES (?,?,?,?)
        ON CONFLICT(operation_id) DO UPDATE SET events=MAX(events,excluded.events), bytes=MAX(bytes,excluded.bytes), requests=MAX(requests,excluded.requests)`,
        )
        .run(operationId, minimum.events, minimum.bytes, minimum.requests);
      assertQuota();
    },
    consume(operationId: string, field: keyof FinishCapacity, amount: number) {
      if (amount === 0) return;
      const result = database
        .prepare(
          `UPDATE finish_reservations SET ${field}=${field}-? WHERE operation_id=? AND ${field}>=?`,
        )
        .run(amount, operationId, amount);
      if (result.changes !== 1)
        throw new StorageError(
          "LIMIT_EXCEEDED",
          "Оставшегося finish/recovery reserve операции недостаточно.",
        );
    },
    release(operationId: string) {
      const operation = database
        .prepare("SELECT write_block FROM operations WHERE operation_id=?")
        .get(operationId);
      if (!operation || operation.write_block !== null)
        throw new StorageError(
          "CONFLICT",
          "Finish reserve нельзя снять у unresolved или отсутствующей operation.",
        );
      database
        .prepare("DELETE FROM finish_reservations WHERE operation_id=?")
        .run(operationId);
    },
  };
}
