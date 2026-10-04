/**
 * @file packages/ai-contracts/src/codexAgentSettings.config.ts
 * @version 1.1.0
 * @date 2026-09-30
 * @description Определяет безопасные начальные параметры агента для новых и прежних интеграций.
 */

import type { CodexAgentSettingsDTO } from "./CodexAgentSettings.types";

/** Пустая модель выбирает штатную модель провайдера; изменяющие операции изначально выключены. */
export const CODEX_AGENT_SETTINGS_DEFAULTS: Readonly<CodexAgentSettingsDTO> =
  Object.freeze({
    model: "",
    reviewModel: "",
    search: Object.freeze({
      enabled: true,
      mode: "direct",
      model: "",
      developerInstructions: false,
    }),
    execution: Object.freeze({
      enabled: false,
      capabilityTTLSeconds: 3600,
      artifactsTTLSeconds: 86400,
    }),
    preview: Object.freeze({ enabled: false, ttlSeconds: 21600 }),
    release: Object.freeze({ enabled: false, ttlSeconds: 86400 }),
    sourcePromotion: Object.freeze({ enabled: false }),
  });
