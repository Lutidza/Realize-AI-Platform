/**
 * @file packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnection.types.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Задаёт серверный lifecycle аренды авторизации Codex из integration registry.
 */

import type { CodexAuthMode } from "@realize/codex-adapter/profile";
import type { Pool } from "pg";
import type { IntegrationSessionLock } from "../../runtime/IntegrationSessionLock.types";

export type CodexConnectionOptions = {
  pool: Pick<Pool, "connect">;
  encryptionKey?: string;
  stateRoot?: string;
  sourceEnvironment?: NodeJS.ProcessEnv;
};

/** Одна session-level DB блокировка для runtime, проверки и изменения подключения. */
export type CodexConnectionLock = IntegrationSessionLock;

/** dispose вызывается после закрытия Codex process и сохраняет обновлённые credentials. */
export type CodexConnectionLease = {
  authMode: CodexAuthMode;
  environment: NodeJS.ProcessEnv;
  home: string;
  /** Текущая модель интеграции; undefined использует штатную модель провайдера. */
  model?: string;
  /** Отдельная модель reviewer с fallback на основную модель этой интеграции. */
  reviewModel?: string;
  revision: number;
  signal: AbortSignal;
  dispose: () => Promise<void>;
};

/** Серверный resolver; lease нельзя передавать модели, публичному API или журналу. */
export interface CodexConnectionResolver {
  acquire(options?: { allowDisabled?: boolean }): Promise<CodexConnectionLease>;
}
