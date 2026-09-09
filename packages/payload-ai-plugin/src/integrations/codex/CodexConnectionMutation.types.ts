/**
 * @file packages/payload-ai-plugin/src/integrations/codex/CodexConnectionMutation.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Задаёт внутренний контракт сохранения credential Codex и завершённого входа.
 */

import type {
  DisconnectIntegrationInput,
  SaveCodexIntegrationInput,
  StartCodexLoginInput,
  TestCodexIntegrationInput,
} from "@realize/ai-contracts";
import type { Pool } from "pg";

/** Native auth JSON или CMS-обёртка access token остаются внутри серверного vault. */
export type CodexCredentialMaterial = {
  authJSON: string;
  accountEmail?: string;
  planType?: string;
};

export type PersistCodexConnectionInput = {
  actorID: number | string;
  idempotencyKey: string;
  input: SaveCodexIntegrationInput;
  credential?: () => Promise<CodexCredentialMaterial>;
};

/** Успешный managed login передаёт credential непосредственно persistence owner. */
export type CompletedCodexLoginInput = CodexCredentialMaterial & {
  actorID: number | string;
  idempotencyKey: string;
  input: StartCodexLoginInput;
};

/** Общие данные авторизованной операции, без деталей HTTP. */
export type CodexMutationInput<T> = {
  actorID: number | string;
  idempotencyKey: string;
  input: T;
};
export type DisconnectCodexMutationInput =
  CodexMutationInput<DisconnectIntegrationInput>;
export type TestCodexMutationInput =
  CodexMutationInput<TestCodexIntegrationInput>;
export type CodexPayloadDatabase = { pool?: Pick<Pool, "connect"> };
