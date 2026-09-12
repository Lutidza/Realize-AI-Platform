/**
 * @file packages/ai-contracts/src/codexChatSettings.config.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сохраняет исходное поведение чата для установок без записанных настроек.
 */

import type { CodexChatSettingsDto } from "./CodexChatSettings.types";

/** Единые неизменяемые defaults для валидатора, сервера и интерфейса. */
export const CODEX_CHAT_SETTINGS_DEFAULTS: Readonly<CodexChatSettingsDto> =
  Object.freeze({
    displayMode: "panel",
    sendOnEnter: true,
    showHistory: true,
    showActivity: false,
    tools: Object.freeze({ codeChanges: true, dataOperations: true }),
  });
