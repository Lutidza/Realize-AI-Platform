/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerProfileEditor.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт свойства формы профиля и конфигурацию её групп связей.
 */

import type {
  AIConfigArtifact,
  AIConfigArtifactKind,
  AIConfigDraftDTO,
} from "@realize/ai-contracts";
import type { AgentLayerProfileInput } from "./AgentLayerConfiguration.types";
import type { AgentLayerEditorState } from "./AgentLayerEditor.types";

export type AgentLayerProfileEditorProps = {
  draft: AIConfigDraftDTO;
  editor: AgentLayerEditorState;
  onOpen: (artifact: AIConfigArtifact) => void;
  onCopy: () => void;
};

export type AgentLayerProfileReferenceField = keyof Pick<
  AgentLayerProfileInput,
  | "roleKeys"
  | "skillKeys"
  | "ruleKeys"
  | "promptTemplateKeys"
  | "workflowKeys"
  | "capabilityBindingKeys"
  | "checkBindingKeys"
>;

/** Поле массива связано с одним типом записей выбранного черновика. */
export type AgentLayerProfileReferenceDefinition = {
  field: AgentLayerProfileReferenceField;
  kind: Exclude<AIConfigArtifactKind, "agent_profile">;
  label: string;
  description: string;
};
