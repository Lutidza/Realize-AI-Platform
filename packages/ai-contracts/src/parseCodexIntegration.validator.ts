/**
 * @file packages/ai-contracts/src/parseCodexIntegration.validator.ts
 * @version 1.4.0
 * @date 2026-09-30
 * @description Проверяет недоверенные запросы подключения Codex и безопасную конфигурацию.
 */

import type {
  CodexAuthMode,
  CompleteCodexBrowserLoginInput,
  CodexIntegrationConfigurationDTO,
  CodexLoginSessionInput,
  SaveCodexIntegrationInput,
  StartCodexLoginInput,
  TestCodexIntegrationInput,
} from "./CodexIntegration.types";
import { ContractValidationError } from "./validation";
import { CODEX_AGENT_SETTINGS_DEFAULTS } from "./codexAgentSettings.config";
import { parseCodexAgentSettings } from "./parseCodexAgentSettings.validator";
import { CODEX_CHAT_SETTINGS_DEFAULTS } from "./codexChatSettings.config";
import { parseCodexChatSettings } from "./parseCodexChatSettings.validator";

const objectOf = (
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractValidationError(
      "Запрос Codex должен быть JSON-объектом.",
    );
  }
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new ContractValidationError(
      "Запрос Codex содержит неподдерживаемые поля.",
    );
  }
  return value as Record<string, unknown>;
};

const revisionOf = (value: unknown, minimum: number): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value >= Number.MAX_SAFE_INTEGER
  ) {
    throw new ContractValidationError(
      "Некорректное значение expectedRevision.",
    );
  }
  return value;
};

const optionalText = (
  value: unknown,
  name: string,
  limit: number,
): string | undefined => {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > limit ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new ContractValidationError(`Некорректное значение ${name}.`);
  }
  return value.trim();
};

const authModeOf = (value: unknown): CodexAuthMode => {
  if (
    value !== "chatgpt" &&
    value !== "apiKey" &&
    value !== "accessToken" &&
    value !== "workloadIdentity"
  ) {
    throw new ContractValidationError(
      "Неподдерживаемый режим авторизации Codex.",
    );
  }
  return value;
};

const loginSettingsOf = (
  input: Record<string, unknown>,
): StartCodexLoginInput => {
  if (typeof input.enabled !== "boolean") {
    throw new ContractValidationError(
      "Поле enabled должно быть логическим значением.",
    );
  }
  const displayName = optionalText(input.displayName, "displayName", 80);
  return {
    ...(displayName ? { displayName } : {}),
    enabled: input.enabled,
    expectedRevision: revisionOf(input.expectedRevision, 0),
  };
};

/** Принимает write-only секрет только соответствующего режима, без путей и команд. */
export const parseSaveCodexIntegrationInput = (
  value: unknown,
): SaveCodexIntegrationInput => {
  const input = objectOf(value, [
    "authMode",
    "loginMethod",
    "apiKey",
    "accessToken",
    "displayName",
    "enabled",
    "expectedRevision",
  ]);
  const authMode = authModeOf(input.authMode);
  if (
    input.loginMethod !== undefined &&
    (authMode !== "chatgpt" ||
      (input.loginMethod !== "browser" && input.loginMethod !== "deviceCode"))
  ) {
    throw new ContractValidationError(
      "Способ входа разрешён только для режима ChatGPT.",
    );
  }
  if (
    input.accessToken !== undefined &&
    (authMode !== "accessToken" ||
      typeof input.accessToken !== "string" ||
      !/^[\x21-\x7e]{16,32768}$/.test(input.accessToken))
  ) {
    throw new ContractValidationError(
      "Access token должен быть допустимым токеном для выбранного режима авторизации.",
    );
  }
  if (
    input.apiKey !== undefined &&
    (authMode !== "apiKey" ||
      typeof input.apiKey !== "string" ||
      !/^[\x21-\x7e]{16,4096}$/.test(input.apiKey))
  ) {
    throw new ContractValidationError(
      "API key должен быть допустимым ключом для выбранного режима авторизации.",
    );
  }
  return {
    ...loginSettingsOf(input),
    authMode,
    ...(input.loginMethod === "browser" || input.loginMethod === "deviceCode"
      ? { loginMethod: input.loginMethod }
      : {}),
    ...(typeof input.apiKey === "string" ? { apiKey: input.apiKey } : {}),
    ...(typeof input.accessToken === "string"
      ? { accessToken: input.accessToken }
      : {}),
  };
};

/** Разрешает только штатный browser или device flow, без секретов в запросе. */
export const parseStartCodexLoginInput = (
  value: unknown,
): StartCodexLoginInput => {
  const input = objectOf(value, [
    "displayName",
    "enabled",
    "expectedRevision",
    "loginMethod",
  ]);
  if (
    input.loginMethod !== undefined &&
    input.loginMethod !== "deviceCode" &&
    input.loginMethod !== "browser"
  ) {
    throw new ContractValidationError("Неподдерживаемый способ входа ChatGPT.");
  }
  return {
    ...loginSettingsOf(input),
    loginMethod: input.loginMethod ?? "deviceCode",
  };
};

/** URL допускается только для штатного loopback callback; state проверяет auth adapter. */
export const parseCompleteCodexBrowserLoginInput = (
  value: unknown,
): CompleteCodexBrowserLoginInput => {
  const input = objectOf(value, ["sessionID", "callbackURL"]);
  const { sessionID } = parseCodexLoginSessionInput({
    sessionID: input.sessionID,
  });
  const callbackURL = optionalText(input.callbackURL, "callbackURL", 16384);
  try {
    const url = new URL(callbackURL ?? "");
    if (
      url.origin !== "http://localhost:1455" ||
      url.pathname !== "/auth/callback" ||
      url.username ||
      url.password ||
      url.hash ||
      !url.searchParams.get("state") ||
      !url.searchParams.get("code") ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.getAll("code").length !== 1
    )
      throw new Error();
  } catch {
    throw new ContractValidationError(
      "Требуется полный адрес завершения входа http://localhost:1455/auth/callback.",
    );
  }
  return { sessionID, callbackURL: callbackURL! };
};

/** Ограничивает непрозрачный идентификатор серверной попытки входа. */
export const parseCodexLoginSessionInput = (
  value: unknown,
): CodexLoginSessionInput => {
  const input = objectOf(value, ["sessionID"]);
  if (
    typeof input.sessionID !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(input.sessionID)
  ) {
    throw new ContractValidationError(
      "Некорректный идентификатор попытки входа.",
    );
  }
  return { sessionID: input.sessionID };
};

/** Проверка ограничена текущей сохранённой версией подключения. */
export const parseTestCodexIntegrationInput = (
  value: unknown,
): TestCodexIntegrationInput => {
  const input = objectOf(value, ["expectedRevision"]);
  return { expectedRevision: revisionOf(input.expectedRevision, 1) };
};

/** Возвращает явную безопасную конфигурацию; raw provider fields запрещены. */
export const parseCodexIntegrationConfiguration = (
  value: unknown,
): CodexIntegrationConfigurationDTO => {
  const input = objectOf(value, [
    "authMode",
    "loginMethod",
    "accountEmail",
    "planType",
    "chat",
    "agent",
  ]);
  const authMode = authModeOf(input.authMode);
  if (
    input.loginMethod !== undefined &&
    (authMode !== "chatgpt" ||
      (input.loginMethod !== "browser" && input.loginMethod !== "deviceCode"))
  ) {
    throw new ContractValidationError(
      "Способ входа разрешён только для режима ChatGPT.",
    );
  }
  const accountEmail = optionalText(input.accountEmail, "accountEmail", 254);
  const planType = optionalText(input.planType, "planType", 80);
  if (
    (authMode === "apiKey" || authMode === "workloadIdentity") &&
    (accountEmail || planType)
  ) {
    throw new ContractValidationError(
      "Выбранный режим не может содержать данные аккаунта ChatGPT.",
    );
  }
  const legacyAgent =
    input.agent &&
    typeof input.agent === "object" &&
    !Array.isArray(input.agent)
      ? (input.agent as Record<string, unknown>)
      : undefined;
  return {
    authMode,
    agent: parseCodexAgentSettings(
      input.agent === undefined
        ? CODEX_AGENT_SETTINGS_DEFAULTS
        : legacyAgent && legacyAgent.search === undefined
          ? { ...legacyAgent, search: CODEX_AGENT_SETTINGS_DEFAULTS.search }
          : input.agent,
    ),
    chat: parseCodexChatSettings(
      input.chat === undefined ? CODEX_CHAT_SETTINGS_DEFAULTS : input.chat,
    ),
    ...(input.loginMethod === "browser" || input.loginMethod === "deviceCode"
      ? { loginMethod: input.loginMethod }
      : {}),
    ...(accountEmail ? { accountEmail } : {}),
    ...(planType ? { planType } : {}),
  };
};
