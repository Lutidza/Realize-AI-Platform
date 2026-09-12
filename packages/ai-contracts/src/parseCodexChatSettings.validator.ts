/**
 * @file packages/ai-contracts/src/parseCodexChatSettings.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет полный безопасный контракт настроек чата без произвольных capabilities.
 */

import type {
  CodexChatSettingsDto,
  SaveCodexChatSettingsInput,
} from "./CodexChatSettings.types";
import { ContractValidationError } from "./validation";

const objectOf = (
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ContractValidationError(
      "Настройки чата должны быть JSON-объектом.",
    );
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new ContractValidationError(
      "Настройки чата содержат неподдерживаемые поля.",
    );
  return value as Record<string, unknown>;
};

const booleanOf = (value: unknown): boolean => {
  if (typeof value !== "boolean")
    throw new ContractValidationError(
      "Переключатели чата должны быть логическими значениями.",
    );
  return value;
};

/** Не применяет defaults к неполному запросу: сохранение всегда явно заменяет весь контракт. */
export const parseCodexChatSettings = (
  value: unknown,
): CodexChatSettingsDto => {
  const input = objectOf(value, [
    "displayMode",
    "sendOnEnter",
    "showHistory",
    "showActivity",
    "tools",
  ]);
  if (
    input.displayMode !== "panel" &&
    input.displayMode !== "window" &&
    input.displayMode !== "page"
  )
    throw new ContractValidationError("Неподдерживаемое расположение чата.");
  const tools = objectOf(input.tools, ["codeChanges", "dataOperations"]);
  return {
    displayMode: input.displayMode,
    sendOnEnter: booleanOf(input.sendOnEnter),
    showHistory: booleanOf(input.showHistory),
    showActivity: booleanOf(input.showActivity),
    tools: {
      codeChanges: booleanOf(tools.codeChanges),
      dataOperations: booleanOf(tools.dataOperations),
    },
  };
};

/** Не принимает секреты, команды, пути, sandbox или произвольные настройки Codex. */
export const parseSaveCodexChatSettingsInput = (
  value: unknown,
): SaveCodexChatSettingsInput => {
  const input = objectOf(value, ["expectedRevision", "settings"]);
  if (
    typeof input.expectedRevision !== "number" ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new ContractValidationError(
      "Некорректное значение expectedRevision.",
    );
  return {
    expectedRevision: input.expectedRevision,
    settings: parseCodexChatSettings(input.settings),
  };
};
