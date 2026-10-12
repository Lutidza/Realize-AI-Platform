/**
 * @file packages/payload-task-manager/src/server/withTaskTransaction.repository.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Сериализует replay и изменения проекта PostgreSQL locks в транзакции Payload.
 * @see documentation/specifications/task-management-execution.md
 */
import { createHash } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from "payload";
import { TaskManagerError } from "./TaskManager.error";

/** Mutations не владеют caller txn; live Git reads требуют свежей ACL после network без чужого snapshot. */
export async function assertIndependentTaskTransaction(
  req: PayloadRequest,
): Promise<void> {
  if ((await req.transactionID) != null)
    throw new TaskManagerError(
      "STORAGE_UNAVAILABLE",
      "Операция с задачей требует отдельного запроса без внешней транзакции.",
      503,
    );
}

/** Атомарный пилот PostgreSQL-only; mutation, audit и replay используют собственную txn. */
export async function withTaskTransaction<T>(
  req: PayloadRequest,
  actorId: string,
  projectId: string | null,
  work: () => Promise<T>,
): Promise<T> {
  await assertIndependentTaskTransaction(req);
  const ownsTransaction = await initTransaction(req);
  if (!ownsTransaction)
    throw new TaskManagerError(
      "STORAGE_UNAVAILABLE",
      "Не удалось создать независимую транзакцию задачи.",
      503,
    );
  try {
    const adapter = req.payload.db as unknown as PostgresAdapter;
    const transactionId = await req.transactionID;
    const transaction =
      transactionId == null
        ? undefined
        : adapter.sessions?.[String(transactionId)]?.db;
    if (adapter.name !== "postgres" || !transaction)
      throw new TaskManagerError(
        "STORAGE_UNAVAILABLE",
        "Атомарное сохранение задач требует PostgreSQL.",
        503,
      );
    await transaction.execute(
      "SET LOCAL lock_timeout = '3000ms'; SET LOCAL statement_timeout = '8000ms'",
    );
    // Actor lock всегда берётся перед project lock; CAS и replay проверяются после locks.
    for (const scope of [
      `actor:${actorId}`,
      ...(projectId ? [`project:${projectId}`] : []),
    ]) {
      const hash = createHash("sha256")
        .update(`realize:task-manager:${scope}`)
        .digest();
      await transaction.execute(
        `SELECT pg_advisory_xact_lock(${hash.readInt32BE(0)}, ${hash.readInt32BE(4)})`,
      );
    }
    const result = await work();
    if (ownsTransaction) await commitTransaction(req);
    return result;
  } catch (error) {
    if (ownsTransaction) await killTransaction(req);
    throw error;
  }
}
