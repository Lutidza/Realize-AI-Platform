/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerPanels.types.ts
 * @version 1.1.0
 * @date 2026-09-10
 * @description Задаёт контракты обзора, системной основы и отчёта проверки.
 */

import type {
  AIConfigBootstrapDTO,
  AIConfigDraftDTO,
  AIConfigValidationDTO,
  AIConfigArtifact,
} from "@realize/ai-contracts";
import type { AgentLayerEditorState } from "./AgentLayerEditor.types";
import type { AgentLayerSection } from "./AgentLayerWorkspace.types";

export type AgentLayerOverviewProps = {
  bootstrap: AIConfigBootstrapDTO;
  draft?: AIConfigDraftDTO;
  isBusy: boolean;
  onSection: (section: AgentLayerSection) => void;
  onOpen: (artifact: AIConfigArtifact) => void;
};
export type AgentLayerRuleEditorProps = {
  draft: AIConfigDraftDTO;
  editor: AgentLayerEditorState;
};
export type AgentLayerValidationProps = {
  validation: AIConfigValidationDTO;
  draft?: AIConfigDraftDTO;
};

export type AgentLayerSystemProps = { system: AIConfigBootstrapDTO["system"] };
