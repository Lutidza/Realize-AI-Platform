/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerBindingEditor.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт свойства формы привязки и её полей системных ограничений.
 */

import type {
  AIConfigDraftDTO,
  SystemAIConfigProjection,
} from "@realize/ai-contracts";
import type { AgentLayerBindingInput } from "./AgentLayerBinding.types";
import type { AgentLayerEditorState } from "./AgentLayerEditor.types";

export type AgentLayerBindingEditorProps = {
  draft: AIConfigDraftDTO;
  system: SystemAIConfigProjection;
  editor: AgentLayerEditorState;
  onCopy: () => void;
};

export type AgentLayerCapabilityFieldsProps = {
  id: string;
  fields: Extract<AgentLayerBindingInput, { kind: "capability_binding" }>;
  system: SystemAIConfigProjection;
  disabled: boolean;
  onChange: (
    input: Extract<AgentLayerBindingInput, { kind: "capability_binding" }>,
  ) => void;
};

export type AgentLayerCheckFieldsProps = {
  id: string;
  fields: Extract<AgentLayerBindingInput, { kind: "check_binding" }>;
  system: SystemAIConfigProjection;
  disabled: boolean;
  onChange: (
    input: Extract<AgentLayerBindingInput, { kind: "check_binding" }>,
  ) => void;
};

export type AgentLayerCapabilityScopesProps = {
  id: string;
  label: string;
  systemScopes: readonly string[];
  value: readonly string[] | undefined;
  hasDescriptor: boolean;
  disabled: boolean;
  onChange: (value: readonly string[] | undefined) => void;
};
