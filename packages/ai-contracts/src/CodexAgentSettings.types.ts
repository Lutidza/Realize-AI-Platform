/**
 * @file packages/ai-contracts/src/CodexAgentSettings.types.ts
 * @version 1.1.0
 * @date 2026-09-30
 * @description Задаёт безопасные настройки работы административного агента без инфраструктуры и секретов.
 * @see documentation/architecture/codex-integration.md
 */

/** Настройки сужают доступные операции; отдельные права и подтверждения остаются обязательными. */
export type CodexAgentSettingsDTO = {
  model: string;
  reviewModel: string;
  search: CodexRepositorySearchSettings;
  execution: {
    enabled: boolean;
    capabilityTTLSeconds: number;
    artifactsTTLSeconds: number;
  };
  preview: { enabled: boolean; ttlSeconds: number };
  release: { enabled: boolean; ttlSeconds: number };
  sourcePromotion: { enabled: boolean };
};

/** Модель используется только native child; область чтения задаёт сервер, а не настройка. */
export type CodexRepositorySearchSettings = {
  enabled: boolean;
  mode: "direct" | "subagent";
  model: string;
  developerInstructions: boolean;
};

/** Закрытый server-to-server допуск chat actor; browser не задаёт его в сообщении. */
export type RepositoryChatAccess = { developerInstructions: boolean };

/** enabled изменяет единственный переключатель подключения вместе с полной версией настроек. */
export type SaveCodexAgentSettingsInput = {
  expectedRevision: number;
  enabled: boolean;
  settings: CodexAgentSettingsDTO;
};
