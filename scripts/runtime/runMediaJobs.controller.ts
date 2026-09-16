/**
 * @file scripts/runtime/runMediaJobs.controller.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Запускает самостоятельный Media worker с окружением Next и обработкой сигналов.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import nextEnvironment from "@next/env";
import { createMediaJobsRuntime } from "./createMediaJobsRuntime.adapter";
import { runMediaJobs } from "./runMediaJobs.service";

const stopping = new AbortController();
const shutdown = () => stopping.abort();
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
try {
  nextEnvironment.loadEnvConfig(
    process.cwd(),
    process.env.NODE_ENV !== "production",
    {
      info: () => undefined,
      error: () => {
        throw new Error("Не удалось загрузить окружение Media worker.");
      },
    },
  );
  if (
    process.env.REALIZE_AI_RUNTIME_ISOLATED === "true" ||
    process.env.PAYLOAD_DB_PUSH === "true"
  )
    throw new Error(
      "Media worker не запускается в isolated или schema-push окружении.",
    );
  const databaseUrl = process.env.DATABASE_URI || process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("Для Media worker требуется подключение PostgreSQL.");
  await runMediaJobs({
    databaseUrl,
    signal: stopping.signal,
    onLockLost: () => {
      // Drain здесь небезопасен: новый владелец уже может восстанавливать незавершённый job.
      console.error(
        "[media] Соединение singleton потеряно; исполнитель немедленно остановлен.",
      );
      process.exit(1);
    },
    initialize: async () => {
      // Config читается после Next env; импорт не включает autoRun или schema push.
      const [{ getPayload }, { default: config }] = await Promise.all([
        import("payload"),
        import("../../src/payload.config"),
      ]);
      return createMediaJobsRuntime(await getPayload({ config, cron: false }));
    },
  });
} catch {
  // Ошибки драйвера/конфига не выводим: они могут содержать URL подключения или ключи.
  console.error(
    "[media] Не удалось запустить или продолжить обработку. Проверьте конфигурацию, миграции и единственный экземпляр worker.",
  );
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", shutdown);
  process.removeListener("SIGTERM", shutdown);
}
// Штатный `payload run` завершает успешный импорт кодом 0; ошибка уже очищенного runner остаётся ошибкой.
if (process.exitCode === 1) process.exit(1);
