/**
 * @file packages/payload-ai-plugin/src/design-workshop/withDesignTransaction.repository.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Сериализует quota/replay владельца и CAS проекта PostgreSQL advisory locks.
 * @see documentation/specifications/design-workshop.md
 */
import { createHash } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { PayloadRequest } from "payload";
import { withPayloadTransaction } from "../endpoints/payloadTransaction";

/** Порядок locks фиксирован: actor, затем project; req переносит одну транзакцию во все Local API writes. */
export function withDesignTransaction<T>(
  req: PayloadRequest,
  actorId: string,
  projectId: string | null,
  work: () => Promise<T>,
): Promise<T> {
  return withPayloadTransaction(req, async () => {
    const transactionId = await req.transactionID;
    const adapter = req.payload.db as unknown as PostgresAdapter;
    const transaction =
      transactionId == null
        ? undefined
        : adapter.sessions?.[String(transactionId)]?.db;
    if (adapter.name !== "postgres" || !transaction)
      throw new Error("Design Workshop requires a PostgreSQL transaction.");
    await transaction.execute(
      "SET LOCAL lock_timeout = '3000ms'; SET LOCAL statement_timeout = '8000ms'",
    );
    const locks = [
      `actor:${actorId}`,
      ...(projectId ? [`project:${projectId}`] : []),
    ];
    for (const key of locks) {
      const hash = createHash("sha256")
        .update(`realize:workshop:${key}`)
        .digest();
      await transaction.execute(
        `SELECT pg_advisory_xact_lock(${hash.readInt32BE(0)}, ${hash.readInt32BE(4)})`,
      );
    }
    return work();
  });
}
