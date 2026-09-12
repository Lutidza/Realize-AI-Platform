/**
 * @file scripts/runtime/startDevelopment.controller.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Запускает локальное окружение проекта одной командой npm run dev.
 */

import nextEnvironment from "@next/env";
import { acquireDevelopmentLock } from "./acquireDevelopmentLock.service";
import { readDevelopmentRuntime } from "./readDevelopmentRuntime.config";
import { superviseDevelopment } from "./superviseDevelopment.service";

const stopping = new AbortController();
const shutdown = () => stopping.abort();
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
let release: (() => Promise<void>) | undefined;
let lostLock = false;
try {
  // Та же загрузка .env*, что у Next; ключи и БД передаются всем детям без расхождений.
  nextEnvironment.loadEnvConfig(process.cwd(), true, {
    info: () => undefined,
    error: () => {
      throw new Error("Не удалось загрузить окружение разработки.");
    },
  });
  const runtime = readDevelopmentRuntime(process.env, process.argv.slice(2));
  if (runtime.local) {
    release = await acquireDevelopmentLock(
      runtime.environment.DATABASE_URI ||
        runtime.environment.DATABASE_URL ||
        "",
      runtime.cwd,
      () => {
        lostLock = true;
        shutdown();
      },
    );
  }
  console.log(
    runtime.local
      ? "[dev] Локальное окружение: приложение, control plane и execution worker."
      : "[dev] Приложение; локальные AI-сервисы в этом режиме не запускаются.",
  );
  process.exitCode = await superviseDevelopment({
    runtime,
    signal: stopping.signal,
  });
  if (lostLock) {
    console.error(
      "[dev] Потеряно соединение блокировки PostgreSQL; окружение остановлено.",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `[dev] ${error instanceof Error ? error.message : "Ошибка запуска окружения."}`,
  );
  process.exitCode = 1;
} finally {
  await release?.().catch(() => undefined);
  process.removeListener("SIGINT", shutdown);
  process.removeListener("SIGTERM", shutdown);
}
