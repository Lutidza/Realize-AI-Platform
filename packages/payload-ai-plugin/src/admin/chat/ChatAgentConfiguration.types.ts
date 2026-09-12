/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatAgentConfiguration.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт состояние выбора профиля активного выпуска для следующего сообщения.
 */

import type {
  AIChatConfigurationCatalogDTO,
  AIChatConfigurationSelection,
} from "@realize/ai-contracts";

/** Выбор остаётся точным даже после обновления активного выпуска; isReady защищает отправку. */
export type ChatAgentConfigurationController = {
  catalog?: AIChatConfigurationCatalogDTO;
  selection?: AIChatConfigurationSelection;
  isLoading: boolean;
  isReady: boolean;
  error?: string;
  refresh: () => Promise<void>;
  selectProfile: (key: string) => void;
  restoreSelection: (selection?: AIChatConfigurationSelection) => void;
};

export type ChatAgentConfigurationProps = {
  configuration: ChatAgentConfigurationController;
  disabled: boolean;
};
