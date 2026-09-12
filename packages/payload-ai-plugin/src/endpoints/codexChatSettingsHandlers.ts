/**
 * @file packages/payload-ai-plugin/src/endpoints/codexChatSettingsHandlers.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Разделяет безопасное чтение настроек чата и административное сохранение интеграции.
 */

import { parseSaveCodexChatSettingsInput } from "@realize/ai-contracts";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { readCodexChatSettings } from "../integrations/codex/readCodexChatSettings.service";
import { saveCodexChatSettings } from "../integrations/codex/saveCodexChatSettings.service";
import {
  consumeRateLimit,
  requireChatUser,
  requireIntegrationManager,
} from "./access";
import { success } from "./http";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

/** Читатели чата не получают сведения аккаунта и право изменять конфигурацию. */
export const createCodexChatSettingsHandlers = (
  options: SanitizedRealizeAIPluginOptions,
) => ({
  read: withHandler(async (req, correlationID) => {
    await requireChatUser(req, options);
    return success(await readCodexChatSettings(req), correlationID);
  }),
  save: withHandler(async (req, correlationID) => {
    const user = await requireIntegrationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseSaveCodexChatSettingsInput(await readBody(req));
    return success(
      await saveCodexChatSettings(req, {
        actorID: user.id,
        idempotencyKey,
        input,
      }),
      correlationID,
    );
  }),
});
