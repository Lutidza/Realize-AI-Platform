/**
 * @file packages/payload-ai-plugin/src/integrations/codex/CodexBrowserLoginLock.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сериализует browser login между репликами CMS через выделенную PostgreSQL session.
 */

import type { Pool } from "pg";
import { EndpointError } from "../../endpoints/http";
import { acquireIntegrationSessionLock } from "../runtime/acquireIntegrationSessionLock.adapter";
import type { CodexBrowserLoginLock } from "./CodexBrowserLoginLock.types";

/** Не использует credential lock; реплика получает отказ до запуска Codex App Server. */
export const acquireCodexBrowserLoginLock = async (
  pool: Pick<Pool, "connect">,
): Promise<CodexBrowserLoginLock> => {
  const result = await acquireIntegrationSessionLock(pool, "codexBrowserLogin");
  switch (result.status) {
    case "acquired":
      return result.lock;
    case "busy":
      throw new EndpointError(
        "CONFLICT",
        "Вход Codex через браузер уже выполняется. Завершите его или используйте код устройства.",
        409,
      );
    case "disconnected":
      throw new EndpointError(
        "INTEGRATION_UNAVAILABLE",
        "Соединение с хранилищем попыток входа Codex потеряно.",
        503,
      );
    case "unavailable":
      throw new EndpointError(
        "INTEGRATION_UNAVAILABLE",
        "Хранилище попыток входа Codex недоступно.",
        503,
      );
  }
};
