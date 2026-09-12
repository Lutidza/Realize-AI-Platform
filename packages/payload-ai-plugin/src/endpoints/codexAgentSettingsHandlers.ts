/**
 * @file packages/payload-ai-plugin/src/endpoints/codexAgentSettingsHandlers.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Сохраняет переключатель и параметры административного агента через право управления интеграциями.
 * @see documentation/architecture/codex-integration.md
 */

import { parseSaveCodexAgentSettingsInput } from "@realize/ai-contracts";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { saveCodexAgentSettings } from "../integrations/codex/saveCodexAgentSettings.service";
import { consumeRateLimit, requireIntegrationManager } from "./access";
import { success } from "./http";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

/** Управление остаётся доступным при выключенном или ещё не настроенном runtime. */
export const createCodexAgentSettingsHandlers = (
  options: SanitizedRealizeAIPluginOptions,
) => ({
  save: withHandler(async (req, correlationID) => {
    const user = await requireIntegrationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseSaveCodexAgentSettingsInput(await readBody(req));
    return success(
      await saveCodexAgentSettings(req, {
        actorID: user.id,
        idempotencyKey,
        input,
      }),
      correlationID,
    );
  }),
});
