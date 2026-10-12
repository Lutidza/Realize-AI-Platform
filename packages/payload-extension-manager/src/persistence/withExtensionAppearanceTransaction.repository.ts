/**
 * @file packages/payload-extension-manager/src/persistence/withExtensionAppearanceTransaction.repository.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Сериализует state и ledger в независимой bounded PostgreSQL транзакции Payload.
 * @see documentation/specifications/extension-management.md
 */

import { createHash } from "node:crypto";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from "payload";
import { ExtensionAppearanceStorageError } from "./ExtensionAppearanceStorage.error";

/** Lock берётся до первого read/upsert; caller transaction не наследуется и не завершается. */
export async function withExtensionAppearanceTransaction<Result>(
  req: PayloadRequest,
  scopeKey: string,
  operation: () => Promise<Result>,
  dependencyScopes: readonly string[] = [],
): Promise<Result> {
  let existingTransaction: string | number | undefined | null;
  try {
    existingTransaction = await req.transactionID;
  } catch {
    throw new ExtensionAppearanceStorageError();
  }
  if (existingTransaction != null) {
    throw new ExtensionAppearanceStorageError(
      "INDEPENDENT_TRANSACTION_REQUIRED",
    );
  }
  if (req.payload.db.name !== "postgres")
    throw new ExtensionAppearanceStorageError();
  let ownsTransaction: boolean;
  try {
    ownsTransaction = await initTransaction(req);
  } catch {
    throw new ExtensionAppearanceStorageError();
  }
  if (!ownsTransaction) throw new ExtensionAppearanceStorageError();
  try {
    const adapter = req.payload.db as unknown as PostgresAdapter;
    const id = await req.transactionID;
    const transaction =
      id == null ? undefined : adapter.sessions?.[String(id)]?.db;
    if (adapter.name !== "postgres" || !transaction)
      throw new ExtensionAppearanceStorageError();
    try {
      await transaction.execute(
        "SET LOCAL lock_timeout = '3000ms'; SET LOCAL statement_timeout = '8000ms'",
      );
      // Общий порядок предотвращает deadlock между shell/appearance; одинаковый scope блокируется один раз.
      for (const scope of [
        ...new Set([scopeKey, ...dependencyScopes]),
      ].sort()) {
        const hash = createHash("sha256")
          .update(`realize:extension-manager:${scope}`)
          .digest();
        await transaction.execute(
          `SELECT pg_advisory_xact_lock(${hash.readInt32BE(0)}, ${hash.readInt32BE(4)})`,
        );
      }
    } catch {
      throw new ExtensionAppearanceStorageError();
    }
    const result = await operation();
    try {
      await commitTransaction(req);
    } catch {
      throw new ExtensionAppearanceStorageError();
    }
    return result;
  } catch (error) {
    try {
      await killTransaction(req);
    } catch {
      throw new ExtensionAppearanceStorageError();
    }
    throw error;
  }
}
