/**
 * @file packages/ai-contracts/src/CodexIntegration.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Задаёт безопасные контракты подключения Codex и входа через ChatGPT.
 */

import type { IntegrationConnectionBaseDTO } from "./integrations";

/** Официальные способы авторизации; workload identity настраивается сервером. */
export type CodexAuthMode =
  "chatgpt" | "apiKey" | "accessToken" | "workloadIdentity";

/** Способ интерактивного входа ChatGPT; по умолчанию используется код устройства. */
export type CodexLoginMethod = "deviceCode" | "browser";

/** Разрешённая проекция аккаунта без credential и локальных путей Codex. */
export type CodexIntegrationConfigurationDTO = {
  authMode: CodexAuthMode;
  loginMethod?: CodexLoginMethod;
  accountEmail?: string;
  planType?: string;
};

/** Browser получает только настройки и признак наличия сохранённого credential. */
export type CodexIntegrationConnectionDTO = IntegrationConnectionBaseDTO & {
  configuration: CodexIntegrationConfigurationDTO;
  provider: "codex";
};

/** API key и access token являются write-only; пустой ввод сохраняет прежний режим. */
export type SaveCodexIntegrationInput = {
  authMode: CodexAuthMode;
  loginMethod?: CodexLoginMethod;
  apiKey?: string;
  accessToken?: string;
  displayName?: string;
  enabled: boolean;
  expectedRevision: number;
};

/** Начало отдельного входа ChatGPT с optimistic revision подключения. */
export type StartCodexLoginInput = {
  loginMethod?: CodexLoginMethod;
  displayName?: string;
  enabled: boolean;
  expectedRevision: number;
};

/** Идентификатор ограниченной серверной попытки входа. */
export type CodexLoginSessionInput = { sessionID: string };

/** Одноразовый callback передаётся телом запроса, не попадает в DTO или audit. */
export type CompleteCodexBrowserLoginInput = CodexLoginSessionInput & {
  callbackURL: string;
};

/** Одноразовый код доступен только администратору, начавшему вход. */
export type CodexLoginPendingDTO = {
  status: "pending";
  sessionID: string;
  expiresAt: string;
} & (
  | { loginMethod: "deviceCode"; verificationURL: string; userCode: string }
  | { loginMethod: "browser"; authorizationURL: string }
);

/** Проверка серверной настройки не раскрывает пути, federation rule или токены. */
export type CodexAuthEnvironmentDTO = {
  workloadIdentity: { configured: boolean; message: string };
};

/** Завершённый вход возвращает безопасное подключение либо безопасную ошибку. */
export type CodexLoginStatusDTO =
  | CodexLoginPendingDTO
  | { status: "completed"; connection: CodexIntegrationConnectionDTO }
  | { status: "failed"; message: string };

/** Проверяется только сохранённая версия credential. */
export type TestCodexIntegrationInput = { expectedRevision: number };

/** Результат проверки аккаунта без ответа внешнего протокола и credential. */
export type TestCodexIntegrationDTO = {
  checkedAt: string;
  status: "failed" | "passed";
  message: string;
  accountEmail?: string;
  planType?: string;
};
