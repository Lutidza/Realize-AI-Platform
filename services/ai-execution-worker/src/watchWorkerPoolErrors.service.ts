/**
 * @file services/ai-execution-worker/src/watchWorkerPoolErrors.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Обрабатывает ошибки idle PostgreSQL connections без аварийного завершения активного задания.
 */

import type { Pool } from "pg";

/** Pool error приходит вне query Promise; listener запрещает новые claims до восстановления heartbeat. */
export const watchWorkerPoolErrors = (
  pools: ReadonlyArray<Pick<Pool, "on">>,
  markUnhealthy: () => void,
): void => {
  for (const pool of pools)
    pool.on("error", () => {
      markUnhealthy();
      // Сообщение драйвера может содержать адреса и credentials; активный job продолжает штатный lifecycle.
      console.error(
        "[ai-execution-worker] database connection unavailable; waiting for recovery",
      );
    });
};
