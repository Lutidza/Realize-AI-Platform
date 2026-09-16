/**
 * @file src/collections/Media/lockMediaTransaction.repository.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Сериализует команды одного Media в существующей PostgreSQL транзакции Payload.
 * @see documentation/specifications/media-management.md
 */
import { sql, type PostgresAdapter } from "@payloadcms/db-postgres";
import type { PayloadRequest } from "payload";

export async function lockMediaTransaction(
  req: PayloadRequest,
  mediaID: number,
) {
  if (!Number.isSafeInteger(mediaID) || mediaID < 1 || mediaID > 2147483647)
    throw new Error("Недопустимый ID Media.");
  const adapter = req.payload.db as Pick<PostgresAdapter, "name" | "sessions">;
  const transactionID = await req.transactionID;
  const transaction =
    transactionID == null
      ? undefined
      : adapter.sessions?.[String(transactionID)]?.db;
  if (adapter.name !== "postgres" || !transaction)
    throw new Error("Команда Media требует PostgreSQL транзакцию.");
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(1835361385, ${mediaID}::integer)`,
  );
}
