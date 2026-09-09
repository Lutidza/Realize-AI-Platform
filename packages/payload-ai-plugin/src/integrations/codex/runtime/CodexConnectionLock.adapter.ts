/**
 * @file packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnectionLock.adapter.ts
 * @version 1.0.1
 * @date 2026-09-09
 * @description Сериализует runtime, проверки и изменения подключения Codex одной PostgreSQL session.
 */

import type { Pool } from "pg";
import { acquireIntegrationSessionLock } from "../../runtime/acquireIntegrationSessionLock.adapter";
import { CodexConnectionError } from "./CodexConnection.error";
import type { CodexConnectionLock } from "./CodexConnection.types";

/** Не ждёт завершения другого Codex процесса; release обязателен в finally. */
export const acquireCodexConnectionLock = async (
  pool: Pick<Pool, "connect">,
): Promise<CodexConnectionLock> => {
  const result = await acquireIntegrationSessionLock(pool, "codexRuntime");
  switch (result.status) {
    case "acquired":
      return result.lock;
    case "busy":
      throw new CodexConnectionError(
        "Интеграция Codex занята. Повторите после завершения текущей операции.",
      );
    case "disconnected":
      throw new CodexConnectionError("Соединение с реестром Codex потеряно.");
    case "unavailable":
      throw new CodexConnectionError("Реестр интеграций Codex недоступен.");
  }
};
