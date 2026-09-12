/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerVersions.types.ts
 * @version 1.1.0
 * @date 2026-09-10
 * @description Описывает каталог доступных черновиков и выпусков конфигурации.
 */

import type { AIConfigBootstrapDTO } from "@realize/ai-contracts";
export type AgentLayerVersionMode = "drafts" | "releases";
export type AgentLayerVersionsState = {
  mode: AgentLayerVersionMode;
  query: string;
  page: number;
};
export type AgentLayerVersionsProps = {
  state?: AgentLayerVersionsState;
  onStateChange?: (state: AgentLayerVersionsState) => void;
  bootstrap: AIConfigBootstrapDTO;
  selectedDraftID?: string;
  disabled: boolean;
  onSelectDraft: (id: string) => void;
  onOpenRelease: (id: string) => void;
};
