/**
 * @file scripts/runtime/runMediaJobs.service.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Последовательно вызывает Payload Jobs и завершает текущее задание перед остановкой.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import { setTimeout as delay } from "node:timers/promises";
import { acquireMediaJobsLock } from "./acquireMediaJobsLock.service";
import type {
  MediaJobsRunnerOptions,
  MediaJobsRuntime,
} from "./MediaJobsRuntime.types";

/** При SIGTERM очередь больше не читается; runtime и lock закрываются после активного run. */
export const runMediaJobs = async ({
  databaseUrl,
  signal,
  initialize,
  onLockLost,
  intervalMs = 5_000,
  log = console.log,
  acquireLock = acquireMediaJobsLock,
}: MediaJobsRunnerOptions): Promise<void> => {
  if (!Number.isInteger(intervalMs) || intervalMs < 1 || intervalMs > 60_000)
    throw new Error(
      "Интервал Media worker должен быть от 1 до 60000 миллисекунд.",
    );
  if (signal.aborted) return;
  let lost = false;
  const lock = await acquireLock(databaseUrl, () => {
    lost = true;
    onLockLost();
  });
  let runtime: MediaJobsRuntime | undefined;
  const assertHeld = async () => {
    if (lost) throw new Error("Блокировка исполнителя Media потеряна.");
    await lock.assertHeld();
    if (lost) throw new Error("Блокировка исполнителя Media потеряна.");
  };
  try {
    if (signal.aborted) return;
    runtime = await initialize();
    if (signal.aborted) return;
    await assertHeld();
    const recovery = await runtime.recover(assertHeld);
    log(
      `[media] Исполнитель готов. Восстановлено: ${recovery.recovered}; завершено с ошибкой: ${recovery.failed}.`,
    );
    while (!signal.aborted) {
      await assertHeld();
      if (signal.aborted) break;
      // Следующий интервал начинается после run; повторы и waitUntil определяет Payload.
      await runtime.run();
      if (signal.aborted) break;
      await delay(intervalMs, undefined, { signal }).catch((error: unknown) => {
        if (!signal.aborted) throw error;
      });
    }
  } finally {
    // Соединение singleton освобождается последним, включая ошибку initialize/recover/run.
    try {
      await runtime?.close();
    } finally {
      await lock.release();
    }
  }
};
