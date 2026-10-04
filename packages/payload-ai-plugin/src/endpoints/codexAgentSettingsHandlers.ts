/**
 * @file packages/payload-ai-plugin/src/endpoints/codexAgentSettingsHandlers.ts
 * @version 1.1.0
 * @date 2026-09-30
 * @description Сохраняет переключатель и параметры административного агента через право управления интеграциями.
 * @see documentation/architecture/codex-integration.md
 */

import { parseSaveCodexAgentSettingsInput } from "@realize/ai-contracts";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { saveCodexAgentSettings } from "../integrations/codex/saveCodexAgentSettings.service";
import { consumeRateLimit, requireIntegrationManager } from "./access";
import { success } from "./http";
import { EndpointError } from "./http";
import { readCodexModels } from "../integrations/codex/readCodexModels.service";
import { idempotencyKeyFor, readBody, withHandler } from "./request";

/** Управление остаётся доступным при выключенном или ещё не настроенном runtime. */
export const createCodexAgentSettingsHandlers = (
  options: SanitizedRealizeAIPluginOptions,
) => ({
  models: withHandler(async (req, correlationID) => {
    const user = await requireIntegrationManager(req, options);
    consumeRateLimit(user.id);
    return success(await readCodexModels(req, options), correlationID);
  }),
  save: withHandler(async (req, correlationID) => {
    const user = await requireIntegrationManager(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const input = parseSaveCodexAgentSettingsInput(await readBody(req));
    const validateNativeSearch = async () => {
      if (
        input.settings.search.enabled &&
        input.settings.search.mode === "subagent"
      ) {
        const catalog = await readCodexModels(req, options);
        if (catalog.revision !== input.expectedRevision)
          throw new EndpointError(
            "CONFLICT",
            "Подключение Codex изменилось. Обновите настройки.",
            409,
          );
        if (
          !catalog.models.some(
            (model) =>
              model.model === input.settings.search.model &&
              model.multiAgentVersion !== "disabled",
          )
        )
          throw new EndpointError(
            "INVALID_REQUEST",
            "Выберите поддерживаемую модель из текущего каталога Codex.",
            400,
          );
      }
    };
    return success(
      await saveCodexAgentSettings(
        req,
        {
          actorID: user.id,
          idempotencyKey,
          input,
        },
        validateNativeSearch,
      ),
      correlationID,
    );
  }),
});
