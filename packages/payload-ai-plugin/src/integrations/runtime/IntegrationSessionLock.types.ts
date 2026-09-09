/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/IntegrationSessionLock.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт серверную аренду PostgreSQL session для блокировок интеграций Codex.
 */

import type { IntegrationRuntimeRepository } from "./IntegrationRuntime.repository";

export type IntegrationSessionLockKind = "codexRuntime" | "codexBrowserLogin";

/** release возвращает соединение в pool либо уничтожает его при неопределённом состоянии lock. */
export type IntegrationSessionLock = {
  repository: IntegrationRuntimeRepository;
  signal: AbortSignal;
  release: () => Promise<void>;
};

/** Ошибки драйвера остаются внутри адаптера; вызывающий слой выбирает сообщение и HTTP статус. */
export type IntegrationSessionLockResult =
  | { status: "acquired"; lock: IntegrationSessionLock }
  | { status: "busy" | "unavailable" | "disconnected" };
