/**
 * @file packages/codex-adapter/src/CodexAccount.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Контракты изолированной авторизации Codex без публичного доступа к токенам.
 */

import type { CodexAuthMode } from "./CodexProfile.types";

export type CodexAccountClientOptions = {
  authMode: CodexAuthMode;
  authJSON?: string;
  codexBinary?: string;
  sourceEnvironment?: NodeJS.ProcessEnv;
};

export type CodexAccountProfile = {
  home: string;
  environment: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  codexBinary?: string;
};

export type CodexAccountInfo =
  | { type: "apiKey" }
  | { type: "chatgpt"; email: string | null; planType: string };

export type CodexDeviceLogin = {
  loginID: string;
  verificationURL: string;
  userCode: string;
};

/** Ссылка запуска штатного OAuth; callback и токены остаются на сервере. */
export type CodexBrowserLogin = {
  loginID: string;
  authorizationURL: string;
};
