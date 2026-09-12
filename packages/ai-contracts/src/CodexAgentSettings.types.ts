/**
 * @file packages/ai-contracts/src/CodexAgentSettings.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт безопасные настройки работы административного агента без инфраструктуры и секретов.
 * @see documentation/architecture/codex-integration.md
 */

/** Настройки сужают доступные операции; отдельные права и подтверждения остаются обязательными. */
export type CodexAgentSettingsDTO = {
  model: string;
  reviewModel: string;
  execution: {
    enabled: boolean;
    capabilityTTLSeconds: number;
    artifactsTTLSeconds: number;
  };
  preview: { enabled: boolean; ttlSeconds: number };
  release: { enabled: boolean; ttlSeconds: number };
  sourcePromotion: { enabled: boolean };
};

/** enabled изменяет единственный переключатель подключения вместе с полной версией настроек. */
export type SaveCodexAgentSettingsInput = {
  expectedRevision: number;
  enabled: boolean;
  settings: CodexAgentSettingsDTO;
};
