/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/acquireIntegrationSessionLock.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Управляет выделенным PostgreSQL client, потерей соединения и освобождением блокировок Codex.
 */

import type { Pool, PoolClient } from "pg";
import { IntegrationRuntimeRepository } from "./IntegrationRuntime.repository";
import type {
  IntegrationSessionLockKind,
  IntegrationSessionLockResult,
} from "./IntegrationSessionLock.types";

/** Оба владельца lock используют одну проверенную процедуру acquire/release без ожидания чужой операции. */
export const acquireIntegrationSessionLock = async (
  pool: Pick<Pool, "connect">,
  kind: IntegrationSessionLockKind,
): Promise<IntegrationSessionLockResult> => {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch {
    return { status: "unavailable" };
  }
  const repository = new IntegrationRuntimeRepository(client);
  const abort = new AbortController();
  const handleDisconnect = (): void => {
    abort.abort();
  };
  client.on("error", handleDisconnect);
  client.on("end", handleDisconnect);
  let locked = false;
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    let destroy = abort.signal.aborted;
    try {
      if (locked && !destroy) {
        if (kind === "codexRuntime") await repository.unlockCodex();
        else await repository.unlockCodexBrowserLogin();
      }
    } catch {
      destroy = true;
    } finally {
      client.off("error", handleDisconnect);
      client.off("end", handleDisconnect);
      client.release(destroy);
    }
  };
  try {
    locked =
      kind === "codexRuntime"
        ? await repository.tryLockCodex()
        : await repository.tryLockCodexBrowserLogin();
    if (!locked || abort.signal.aborted) {
      const status = abort.signal.aborted ? "disconnected" : "busy";
      await release();
      return { status };
    }
    return {
      status: "acquired",
      lock: { repository, signal: abort.signal, release },
    };
  } catch {
    // После ошибки acquire неизвестно, успел ли PostgreSQL выдать lock: client нельзя возвращать в pool.
    abort.abort();
    await release();
    return { status: "unavailable" };
  }
};
