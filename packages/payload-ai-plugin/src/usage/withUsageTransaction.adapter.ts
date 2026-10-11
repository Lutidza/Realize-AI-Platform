/**
 * @file packages/payload-ai-plugin/src/usage/withUsageTransaction.adapter.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Ограничивает lease и атомарно согласует usage, pricing и резерв бюджета.
 */
import type { PoolClient } from "pg";
import type { UsageDatabase } from "./UsageStore.types";

export async function withUsageTransaction<T>(
  database: UsageDatabase,
  action: (client: PoolClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  if (!database.pool) throw new Error("USAGE_STORE_UNAVAILABLE");
  let abandoned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = database.pool.connect();
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
          reject(new Error("USAGE_STORE_BUSY"));
        }, 3000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  try {
    await client.query(
      readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
    );
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL statement_timeout = '8000ms'");
    await client.query("SET LOCAL lock_timeout = '3000ms'");
    // Один порядок записи нужен для атомарной проверки provider и customer account.
    if (!readOnly)
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('realize:usage-ledger:v1'))",
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
