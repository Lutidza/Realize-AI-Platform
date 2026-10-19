/**
 * @file packages/payload-access-management/src/server/withAccessTransaction.repository.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Сериализует выдачу, ротацию и отзыв через собственные PostgreSQL transactions и locks.
 * @see documentation/architecture/platform-access.md
 */
import { createHash } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from "payload";
import { AccessManagementError } from "./AccessManagement.error";
const unavailable = () =>
  new AccessManagementError(
    "STORAGE_UNAVAILABLE",
    "Хранилище доступов временно недоступно.",
    503,
  );
/** Lock также вызывается внутри Task mutation, чтобы revoke и его scope check были сериализованы. */
export async function lockAccessScope(
  req: PayloadRequest,
  scope: string,
): Promise<void> {
  const adapter = req.payload.db as unknown as PostgresAdapter;
  const id = await req.transactionID;
  const db = id == null ? undefined : adapter.sessions?.[String(id)]?.db;
  if (adapter.name !== "postgres" || !db) throw unavailable();
  const hash = createHash("sha256").update(`realize:access:${scope}`).digest();
  await db.execute(
    `SELECT pg_advisory_xact_lock(${hash.readInt32BE(0)}, ${hash.readInt32BE(4)})`,
  );
}
export async function withAccessTransaction<T>(
  req: PayloadRequest,
  scopes: string[],
  work: () => Promise<T>,
): Promise<T> {
  if ((await req.transactionID) != null || !(await initTransaction(req)))
    throw unavailable();
  try {
    const adapter = req.payload.db as unknown as PostgresAdapter;
    const id = await req.transactionID;
    const db = id == null ? undefined : adapter.sessions?.[String(id)]?.db;
    if (adapter.name !== "postgres" || !db) throw unavailable();
    await db.execute(
      "SET LOCAL lock_timeout = '3000ms'; SET LOCAL statement_timeout = '8000ms'",
    );
    for (const scope of scopes) await lockAccessScope(req, scope);
    const result = await work();
    await commitTransaction(req);
    return result;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
}
