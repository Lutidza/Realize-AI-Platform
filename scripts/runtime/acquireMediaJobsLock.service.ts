/**
 * @file scripts/runtime/acquireMediaJobsLock.service.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Удерживает единственный исполнитель Media в подключённой PostgreSQL базе.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import { Client } from "pg";
import type { MediaJobsLock } from "./MediaJobsRuntime.types";

/** Одинаковый ключ защищает очередь от второго процесса в другом checkout. */
export const acquireMediaJobsLock = async (
  databaseUrl: string,
  onLost: () => void,
): Promise<MediaJobsLock> => {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 1_000,
  });
  let held = false;
  let closing = false;
  let lost = false;
  const connectionLost = () => {
    if (!held || closing || lost) return;
    lost = true;
    onLost();
  };
  client.on("error", connectionLost);
  client.on("end", connectionLost);
  try {
    await client.connect();
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('realize-media-jobs'), hashtext('media')) AS acquired",
    );
    if (!result.rows[0]?.acquired)
      throw new Error("Исполнитель Media уже запущен для этой базы данных.");
    held = true;
  } catch (error) {
    closing = true;
    await client.end().catch(() => undefined);
    if (error instanceof Error && error.message.startsWith("Исполнитель Media"))
      throw error;
    throw new Error(
      "Не удалось получить блокировку Media. Проверьте доступность PostgreSQL.",
    );
  }
  return {
    assertHeld: async () => {
      if (closing || lost)
        throw new Error("Блокировка исполнителя Media потеряна.");
      try {
        await client.query("SELECT 1");
      } catch {
        connectionLost();
        throw new Error("Блокировка исполнителя Media потеряна.");
      }
    },
    release: async () => {
      closing = true;
      await client.end();
    },
  };
};
