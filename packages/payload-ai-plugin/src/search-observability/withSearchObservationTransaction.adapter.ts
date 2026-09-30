/**
 * @file packages/payload-ai-plugin/src/search-observability/withSearchObservationTransaction.adapter.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Ограничивает lease и сериализует транзакции записи, настройки и очистки диагностики.
 */
import type { PoolClient } from "pg";
import type { SearchObservationDatabase } from "./SearchObservationStore.types";
import { EndpointError } from "../endpoints/http";

export async function withSearchObservationTransaction<T>(
  database: SearchObservationDatabase,
  action: (client: PoolClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  if (!database.pool)
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Диагностика поиска недоступна.",
      503,
    );
  let abandoned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = database.pool.connect();
  // Lease, выданный уже после timeout, обязательно возвращается в общий пул.
  void pending.then(
    (client) => {
      if (abandoned) client.release();
    },
    () => undefined,
  );
  let client: PoolClient;
  try {
    client = await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abandoned = true;
          reject(
            new EndpointError(
              "INTEGRATION_UNAVAILABLE",
              "Хранилище диагностики занято.",
              503,
            ),
          );
        }, 1500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  try {
    await client.query(
      readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
    );
    await client.query("SET LOCAL statement_timeout = '1000ms'");
    await client.query("SET LOCAL lock_timeout = '200ms'");
    if (!readOnly)
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('realize:search-observations'))",
      );
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
