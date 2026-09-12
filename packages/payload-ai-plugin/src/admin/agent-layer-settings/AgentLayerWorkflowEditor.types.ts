/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowEditor.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Описывает представление редактора процесса, выбранного шага и его параметров.
 */

import type {
  AIConfigArtifact,
  AIConfigDraftDTO,
  SystemAIConfigProjection,
} from "@realize/ai-contracts";
import type { RefObject } from "react";
import type { AgentLayerEditorState } from "./AgentLayerEditor.types";
import type {
  AgentLayerChoiceListState,
  AgentLayerChoiceOption,
} from "./AgentLayerChoiceList.types";
import type {
  AgentLayerWorkflowInput,
  AgentLayerWorkflowStepInput,
  AgentLayerWorkflowValueSourceInput,
  AgentLayerWorkflowLiteralInput,
} from "./AgentLayerWorkflow.types";

export type AgentLayerWorkflowEditorProps = {
  draft: AIConfigDraftDTO;
  system: SystemAIConfigProjection;
  editor: AgentLayerEditorState;
  onOpen: (artifact: AIConfigArtifact) => void;
  onCopy: () => void;
};

export type AgentLayerWorkflowReferenceFieldProps = {
  label: string;
  description?: string;
  options: readonly AgentLayerChoiceOption[];
  value: string;
  disabled: boolean;
  navigationDisabled?: boolean;
  onChange: (value: string) => void;
  onOpen?: (key: string) => void;
};

export type AgentLayerWorkflowLiteralEditorProps = {
  id: string;
  value: AgentLayerWorkflowLiteralInput;
  disabled: boolean;
  onChange: (value: AgentLayerWorkflowLiteralInput) => void;
};

export type AgentLayerWorkflowValueSourceEditorProps = {
  id: string;
  label: string;
  value: AgentLayerWorkflowValueSourceInput;
  steps: readonly AgentLayerWorkflowStepInput[];
  disabled: boolean;
  onChange: (value: AgentLayerWorkflowValueSourceInput) => void;
  onOpenStep: (id: string) => void;
};

export type AgentLayerWorkflowInputFieldsProps = {
  id: string;
  step: Extract<AgentLayerWorkflowStepInput, { type: "capability" }>;
  steps: readonly AgentLayerWorkflowStepInput[];
  disabled: boolean;
  onChange: (
    step: Extract<AgentLayerWorkflowStepInput, { type: "capability" }>,
  ) => void;
  onOpenStep: (id: string) => void;
};

export type UseAgentLayerWorkflowEditorOptions = {
  fields: AgentLayerWorkflowInput;
  artifacts: readonly AIConfigArtifact[];
  disabled: boolean;
  onChange: (fields: AgentLayerWorkflowInput) => void;
};

export type AgentLayerWorkflowEditorState = {
  selectedStep: AgentLayerWorkflowStepInput | undefined;
  picker: AgentLayerChoiceListState;
  newType: AgentLayerWorkflowStepInput["type"];
  typeFilter: AgentLayerWorkflowStepInput["type"] | "all";
  problemOnly: boolean;
  problemStepCount: number;
  problems: readonly string[];
  removalReason: string | undefined;
  error: string | undefined;
  setNewType: (type: AgentLayerWorkflowStepInput["type"]) => void;
  setTypeFilter: (type: AgentLayerWorkflowStepInput["type"] | "all") => void;
  setProblemOnly: (value: boolean) => void;
  openStep: (id: string) => void;
  addStep: () => void;
  copyStep: () => void;
  removeStep: () => void;
  updateStep: (step: AgentLayerWorkflowStepInput) => void;
  renameStep: () => void;
  changeStepType: (type: AgentLayerWorkflowStepInput["type"]) => void;
};

/** DOM ref извлекается отдельно от состояния, передаваемого представлениям. */
export type UseAgentLayerWorkflowEditorResult =
  AgentLayerWorkflowEditorState & {
    selectedStepRef: RefObject<HTMLDivElement | null>;
  };

export type AgentLayerWorkflowStepCatalogProps = {
  fields: AgentLayerWorkflowInput;
  workflow: AgentLayerWorkflowEditorState;
  disabled: boolean;
};

export type AgentLayerWorkflowStepEditorProps = {
  id: string;
  step: AgentLayerWorkflowStepInput;
  fields: AgentLayerWorkflowInput;
  artifacts: readonly AIConfigArtifact[];
  workflow: AgentLayerWorkflowEditorState;
  disabled: boolean;
  navigationDisabled: boolean;
  onOpen: (artifact: AIConfigArtifact) => void;
};
