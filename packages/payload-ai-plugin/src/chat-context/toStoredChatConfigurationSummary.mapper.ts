/**
 * @file packages/payload-ai-plugin/src/chat-context/toStoredChatConfigurationSummary.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Выдаёт из серверного снимка запуска только проверяемую краткую проекцию профиля и выпуска.
 */
import type { AIChatConfigurationSummary } from "@realize/ai-contracts";
import {
  parseAIChatConfigurationSnapshot,
  toAIChatConfigurationSummary,
} from "@realize/change-engine";

export const toStoredChatConfigurationSummary = (
  value: unknown,
): AIChatConfigurationSummary | undefined => {
  if (
    !value ||
    typeof value !== "object" ||
    !("agentConfiguration" in value) ||
    value.agentConfiguration === undefined
  )
    return undefined;
  return toAIChatConfigurationSummary(
    parseAIChatConfigurationSnapshot(value.agentConfiguration),
  );
};
