/**
 * @file scripts/runtime/loadProductionEnvironment.mjs
 * @version 1.0.0
 * @date 2026-09-15
 * @description Загружает единое production-окружение Next до старта приложения или отдельного worker.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import nextEnvironment from "@next/env";

if (process.env.NODE_ENV !== "production") {
  throw new Error("Production preload требует NODE_ENV=production.");
}

// Standalone меняет cwd; Node --import выполняет эту загрузку ещё в корне проекта.
nextEnvironment.loadEnvConfig(process.cwd(), false, {
  info: () => undefined,
  error: () => {
    throw new Error("Не удалось загрузить production-окружение.");
  },
});
