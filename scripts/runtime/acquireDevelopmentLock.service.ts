/**
 * @file scripts/runtime/acquireDevelopmentLock.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Удерживает блокировку совместного запуска до завершения дочерних процессов.
 */

import { Client } from "pg";

/** Session advisory lock освобождается PostgreSQL и при аварийном разрыве соединения. */
export const acquireDevelopmentLock = async (
  databaseUrl: string,
  cwd: string,
  onLost: () => void,
) => {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });
  client.on("error", onLost);
  try {
    await client.connect();
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('realize-development'), hashtext($1)) AS acquired",
      [cwd],
    );
    if (!result.rows[0]?.acquired)
      throw new Error(
        "Совместный запуск этого проекта уже работает. Используйте существующий процесс.",
      );
  } catch (error) {
    await client.end().catch(() => undefined);
    if (error instanceof Error && error.message.startsWith("Совместный запуск"))
      throw error;
    throw new Error(
      "Не удалось подключить совместный запуск к PostgreSQL. Проверьте доступность БД.",
    );
  }
  return async () => {
    await client.end();
  };
};
