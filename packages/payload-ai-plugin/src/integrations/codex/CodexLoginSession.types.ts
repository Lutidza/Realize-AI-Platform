/**
 * @file packages/payload-ai-plugin/src/integrations/codex/CodexLoginSession.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Внутренние состояния попытки входа Codex и контракт сохранения credential.
 */

import type {
  CodexIntegrationConnectionDTO,
  CodexLoginPendingDTO,
  CodexLoginStatusDTO,
  StartCodexLoginInput,
} from "@realize/ai-contracts";
import type { CodexAccountClient } from "@realize/codex-adapter/account";
import type { CodexBrowserLoginLock } from "./CodexBrowserLoginLock.types";

export type CodexLoginOwner = { actorKey: string; installationKey: string };

/** Фабрика привязана к pool текущего запроса; browser flow без общей блокировки запрещён. */
export type CodexLoginResources = {
  acquireBrowserLock?: () => Promise<CodexBrowserLoginLock>;
};

export type CodexLoginStartReservation = {
  idempotencyKey: string;
  inputKey: string;
  promise: Promise<CodexLoginPendingDTO>;
};

/** Секрет доступен лишь серверной операции сохранения; не является DTO. */
export type CompletedCodexLogin = {
  input: StartCodexLoginInput;
  authJSON: string;
  accountEmail?: string;
  planType?: string;
  idempotencyKey: string;
};

export type PersistCodexLogin = (
  input: CompletedCodexLogin,
) => Promise<CodexIntegrationConnectionDTO>;

export type CodexLoginSession = {
  owner: CodexLoginOwner;
  idempotencyKey: string;
  input: StartCodexLoginInput;
  expiresAt: number;
  state: "starting" | "pending" | "ready" | "completed" | "failed";
  opening?: Promise<CodexLoginPendingDTO>;
  pending?: CodexLoginPendingDTO;
  client?: CodexAccountClient;
  clientOpening?: Promise<CodexAccountClient>;
  browserLockOpening?: Promise<CodexBrowserLoginLock>;
  browserLock?: CodexBrowserLoginLock;
  handleLockAbort?: () => void;
  closing?: Promise<void>;
  loginID?: string;
  credential?: CompletedCodexLogin;
  result?: CodexLoginStatusDTO;
  finalizing?: Promise<CodexLoginStatusDTO>;
  completing?: Promise<void>;
  callbackHash?: string;
  timer?: NodeJS.Timeout;
};
