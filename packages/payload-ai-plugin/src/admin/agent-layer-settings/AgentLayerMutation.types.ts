/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerMutation.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Разделяет жизненный цикл одной записи и состояние представления конфигурации.
 */
import type {
  AIConfigDraftDTO,
  AIConfigValidationDTO,
} from "@realize/ai-contracts";
import type { AgentLayerConfigurationAdapter } from "./AgentLayerConfiguration.adapter";
import type {
  AgentLayerConfigurationFailure,
  AgentLayerMutation,
} from "./AgentLayerConfiguration.types";
export type UseAgentLayerMutationOptions = {
  api: AgentLayerConfigurationAdapter;
  onStart: () => void;
  onFailure: (failure: AgentLayerConfigurationFailure) => void;
  onSuccess: (
    draft: AIConfigDraftDTO,
    kind: AgentLayerMutation["kind"],
    validation?: AIConfigValidationDTO,
  ) => void;
};
export type UseAgentLayerMutationResult = {
  isBusy: boolean;
  hasPendingMutation: boolean;
  isLocked: () => boolean;
  execute: (command: AgentLayerMutation) => Promise<boolean>;
  retry: () => Promise<boolean>;
};
