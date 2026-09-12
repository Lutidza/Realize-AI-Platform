/**
 * @file packages/payload-ai-plugin/src/endpoints/lockAITransaction.util.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Сериализует изменения конфигурации, workflow и страниц в принадлежащей Payload транзакции.
 */
import type { PayloadRequest } from "payload";

/** Только статические server-owned области; ввод запроса не попадает в SQL. */
export const lockAITransaction = async (
  req: PayloadRequest,
  scope: "configuration" | "workflow" | "page-drafts",
): Promise<void> => {
  const transactionID = await req.transactionID;
  const adapter = req.payload.db as unknown as {
    name?: string;
    sessions?: Record<
      string,
      { db?: { execute?: (query: string) => Promise<unknown> } }
    >;
  };
  const transaction =
    transactionID == null
      ? undefined
      : adapter.sessions?.[String(transactionID)]?.db;
  if (adapter.name !== "postgres" || typeof transaction?.execute !== "function")
    throw new Error("AI mutations require an active PostgreSQL transaction.");
  await transaction.execute(
    scope === "configuration"
      ? "SELECT pg_advisory_xact_lock(hashtext('realize:ai-config:installation'))"
      : scope === "page-drafts"
        ? "SELECT pg_advisory_xact_lock(hashtext('realize:pages:draft-writes'))"
        : "SELECT pg_advisory_xact_lock(hashtext('realize:workflow:projection'))",
  );
};
