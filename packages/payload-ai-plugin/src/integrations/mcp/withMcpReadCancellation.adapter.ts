/**
 * @file packages/payload-ai-plugin/src/integrations/mcp/withMcpReadCancellation.adapter.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Отменяет PostgreSQL запрос принадлежащей чтению транзакции и ждёт остановки перед освобождением.
 */
import { Client } from "pg";
import type { PayloadRequest } from "payload";

/** Proxy касается только выделенной Drizzle session; общий pool и чужие запросы не меняются. */
export async function withMcpReadCancellation<T>(
  req: PayloadRequest,
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const id = await req.transactionID;
  const adapter = req.payload.db as unknown as {
    poolOptions: { connectionString?: string; [key: string]: unknown };
    sessions: Record<
      string,
      {
        db: {
          execute: (sql: string) => Promise<{ rows: { pid: number }[] }>;
          session: { client: Client };
        };
      }
    >;
  };
  const db = adapter.sessions[String(id)]?.db;
  if (!db?.session?.client)
    throw new Error("MCP PostgreSQL session is unavailable.");
  const pid = (await db.execute("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
  if (!Number.isSafeInteger(pid))
    throw new Error("MCP PostgreSQL session identity is unavailable.");
  const original = db.session.client;
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    cancellation ??= (async () => {
      // Отдельное connection не ждёт слот занятого application pool.
      const control = new Client({
        ...adapter.poolOptions,
        connectionTimeoutMillis: 1000,
        query_timeout: 1000,
        statement_timeout: 1000,
      });
      try {
        await control.connect();
        await control.query("SELECT pg_cancel_backend($1)", [pid]);
      } catch {
        /* statement_timeout остаётся последним ограничителем при сетевой недоступности. */
      } finally {
        await control.end().catch(() => undefined);
      }
    })();
  };
  db.session.client = new Proxy(original, {
    get(target, property) {
      if (property === "query")
        return async (...args: Parameters<Client["query"]>) => {
          const statement =
            typeof args[0] === "string"
              ? args[0]
              : ((args[0] as { text?: string })?.text ?? "");
          // Payload может откатывать транзакцию внутри find catch до возврата в facade.
          // Rollback дожидается cancel; pool не получает незавершённую или поздно отменённую session.
          if (/^rollback\b/i.test(statement.trim())) await cancellation;
          else signal.throwIfAborted();
          return target.query(...args);
        };
      return Reflect.get(target, property, target);
    },
  });
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    const result = await work();
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener("abort", cancel);
    await cancellation;
    db.session.client = original;
  }
}
