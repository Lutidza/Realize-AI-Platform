/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/withMcpTransaction.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Сериализует CAS, клиентские ключи и acknowledgements одного MCP экземпляра.
 */
import { createHash } from "node:crypto";
import type { PayloadRequest } from "payload";
import { withPayloadTransaction } from "../../endpoints/payloadTransaction";

/** Числовые lock keys получены из namespace; client input никогда не становится SQL. */
export async function withMcpTransaction<T>(
  req: PayloadRequest,
  serverID: string,
  work: () => Promise<T>,
): Promise<T> {
  return withPayloadTransaction(req, async () => {
    const transactionID = await req.transactionID;
    const db = req.payload.db as unknown as {
      name?: string;
      sessions?: Record<
        string,
        { db?: { execute: (sql: string) => Promise<unknown> } }
      >;
    };
    const transaction =
      transactionID === undefined || transactionID === null
        ? undefined
        : db.sessions?.[String(transactionID)]?.db;
    if (db.name !== "postgres" || !transaction)
      throw new Error("MCP requires a PostgreSQL transaction.");
    await transaction.execute(
      "SET LOCAL lock_timeout = '3000ms'; SET LOCAL statement_timeout = '5000ms'",
    );
    const hash = createHash("sha256")
      .update(`realize:mcp:${serverID}`)
      .digest();
    await transaction.execute(
      `SELECT pg_advisory_xact_lock(${hash.readInt32BE(0)}, ${hash.readInt32BE(4)})`,
    );
    return work();
  });
}
