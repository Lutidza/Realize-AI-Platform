/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkspace.types.ts
 * @version 1.4.0
 * @date 2026-09-10
 * @description Описывает навигацию и выбор записи внутри рабочей области агентского слоя.
 */

import type {
  AIConfigArtifact,
  AIConfigArtifactKind,
} from "@realize/ai-contracts";
import type { LucideIcon } from "lucide-react";
import type { AgentLayerEditorState } from "./AgentLayerEditor.types";
import type { AgentLayerInstructionKind } from "./AgentLayerInstruction.types";
import type { AgentLayerBindingKind } from "./AgentLayerBinding.types";
import type { UseAgentLayerConfigurationResult } from "./AgentLayerConfiguration.types";

export type AgentLayerSection =
  AIConfigArtifactKind | "overview" | "all" | "versions" | "system";
export type AgentLayerSectionDefinition = {
  id: AgentLayerSection;
  label: string;
  description: string;
  icon: LucideIcon;
};
export type AgentLayerNavigationGroup = {
  label: string;
  items: readonly AgentLayerSectionDefinition[];
};
export type AgentLayerSelection =
  | { draftID: string; kind: AIConfigArtifactKind; key: string }
  | {
      draftID: string;
      kind: "new_rule" | "new_profile" | "new_workflow";
      selectionID: string;
    }
  | {
      draftID: string;
      kind: "new_instruction";
      artifactKind: AgentLayerInstructionKind;
      selectionID: string;
    }
  | {
      draftID: string;
      kind: "new_binding";
      artifactKind: AgentLayerBindingKind;
      selectionID: string;
    };
export type AgentLayerNavigationProps = {
  section: AgentLayerSection;
  artifacts: readonly AIConfigArtifact[];
  disabled: boolean;
  onSelect: (section: AgentLayerSection) => void;
};
export type UseAgentLayerWorkspaceOptions = {
  configuration: UseAgentLayerConfigurationResult;
  editor: AgentLayerEditorState;
};
