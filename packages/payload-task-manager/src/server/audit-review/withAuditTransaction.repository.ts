/**
 * @file packages/payload-task-manager/src/server/audit-review/withAuditTransaction.repository.ts
 * @version 1.1.0
 * @date 2026-11-26
 * @description Фиксирует операции пилота атомарно и закрывает запись вне выделенной PostgreSQL.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import type { Pool, PoolClient } from "pg";

/** Инициализация и чтение подчиняются тому же ограничению БД, что и запись. */
export async function withAuditTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  mode: "transaction" | "read_snapshot" = "transaction",
): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query(
      mode === "read_snapshot"
        ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
        : "BEGIN",
    );
    await client.query("SET LOCAL search_path TO pg_catalog");
    const result = await client.query<{ name: string }>(
      "SELECT current_database() AS name",
    );
    if (result.rows[0]?.name !== "realize_checkpoint_pilot")
      throw new Error("audit_database_mismatch");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
