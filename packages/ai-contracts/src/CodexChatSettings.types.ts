/**
 * @file packages/ai-contracts/src/CodexChatSettings.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт безопасные настройки представления чата и доступности управляемых операций.
 */

/** Переключатели сужают возможности CMS и не заменяют права, sandbox или подтверждения. */
export type CodexChatSettingsDto = {
  displayMode: "panel" | "window" | "page";
  sendOnEnter: boolean;
  showHistory: boolean;
  showActivity: boolean;
  tools: {
    codeChanges: boolean;
    dataOperations: boolean;
  };
};

/** Полная замена настроек привязана к текущей ревизии подключения. */
export type SaveCodexChatSettingsInput = {
  expectedRevision: number;
  settings: CodexChatSettingsDto;
};
