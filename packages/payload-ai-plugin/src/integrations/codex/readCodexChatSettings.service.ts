/**
 * @file packages/payload-ai-plugin/src/integrations/codex/readCodexChatSettings.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Читает безопасные настройки чата без credential и персональных данных аккаунта.
 */

import {
  CODEX_CHAT_SETTINGS_DEFAULTS,
  parseCodexChatSettings,
  parseCodexIntegrationConfiguration,
  type CodexChatSettingsDto,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { EndpointError } from "../../endpoints/http";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import { PRIMARY_CODEX_CONNECTION_KEY } from "../providers";

/** Отсутствие подключения сохраняет defaults; повреждённые настройки не расширяют доступ. */
export const readCodexChatSettings = async (
  req: PayloadRequest,
): Promise<CodexChatSettingsDto> => {
  const connection = await new IntegrationRepository(
    req.payload,
    req,
  ).getByConnectionKey(PRIMARY_CODEX_CONNECTION_KEY);
  if (!connection) return parseCodexChatSettings(CODEX_CHAT_SETTINGS_DEFAULTS);
  try {
    if (connection.provider !== "codex") throw new Error("invalid_provider");
    return parseCodexIntegrationConfiguration(connection.configuration).chat;
  } catch {
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Настройки чата Codex недоступны. Проверьте интеграцию.",
      503,
    );
  }
};
