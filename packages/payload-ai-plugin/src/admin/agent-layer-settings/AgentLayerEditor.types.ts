/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerEditor.types.ts
 * @version 1.5.0
 * @date 2026-09-10
 * @description Описывает формы записей с общими действиями и защитой изменений.
 */

import type {
  AIAgentProfileDefinition,
  AILocalRuleDefinition,
  WorkflowDefinition,
} from "@realize/ai-contracts";
import type {
  AgentLayerRuleInput,
  AgentLayerProfileInput,
  UseAgentLayerConfigurationResult,
} from "./AgentLayerConfiguration.types";
import type {
  AgentLayerInstructionArtifact,
  AgentLayerInstructionInput,
  AgentLayerInstructionKind,
} from "./AgentLayerInstruction.types";
import type {
  AgentLayerBindingArtifact,
  AgentLayerBindingInput,
  AgentLayerBindingKind,
} from "./AgentLayerBinding.types";
import type { AgentLayerWorkflowInput } from "./AgentLayerWorkflow.types";

export type AgentLayerRuleFields = Omit<AgentLayerRuleInput, "priority"> & {
  priority: string;
};
export type AgentLayerRuleForm = {
  draftID: string;
  originalKey?: string;
  fields: AgentLayerRuleFields;
  baseline: AgentLayerRuleFields;
};
export type AgentLayerProfileForm = {
  draftID: string;
  originalKey?: string;
  fields: AgentLayerProfileInput;
  baseline: AgentLayerProfileInput;
};
export type AgentLayerInstructionForm = {
  draftID: string;
  originalKey?: string;
  fields: AgentLayerInstructionInput;
  baseline: AgentLayerInstructionInput;
};
export type AgentLayerBindingForm = {
  draftID: string;
  originalKey?: string;
  fields: AgentLayerBindingInput;
  baseline: AgentLayerBindingInput;
};
export type AgentLayerWorkflowForm = {
  draftID: string;
  originalKey?: string;
  fields: AgentLayerWorkflowInput;
  baseline: AgentLayerWorkflowInput;
};
/** Один выбранный редактор разделяет общий lifecycle сохранения и выхода. */
export type AgentLayerActiveForm =
  | (AgentLayerRuleForm & { kind: "local_rule" })
  | (AgentLayerProfileForm & { kind: "agent_profile" })
  | (AgentLayerInstructionForm & { kind: "instruction" })
  | (AgentLayerBindingForm & { kind: "binding" })
  | (AgentLayerWorkflowForm & { kind: "workflow_definition" });
export type AgentLayerEditorState = {
  form: AgentLayerRuleForm | null;
  profileForm: AgentLayerProfileForm | null;
  instructionForm: AgentLayerInstructionForm | null;
  bindingForm: AgentLayerBindingForm | null;
  bindingNotice?: string;
  workflowForm: AgentLayerWorkflowForm | null;
  workflowNotice?: string;
  instructionNotice?: string;
  profileNotice?: string;
  formError?: string;
  isDirty: boolean;
  isReadOnly: boolean;
  isLocked: boolean;
  update: <K extends keyof AgentLayerRuleFields>(
    key: K,
    value: AgentLayerRuleFields[K],
  ) => void;
  updateProfile: <K extends keyof AgentLayerProfileInput>(
    key: K,
    value: AgentLayerProfileInput[K],
  ) => void;
  selectRule: (rule: AILocalRuleDefinition) => boolean;
  newRule: () => boolean;
  selectProfile: (profile: AIAgentProfileDefinition) => boolean;
  newProfile: () => boolean;
  copyProfile: (profile: AIAgentProfileDefinition) => boolean;
  updateInstruction: (input: AgentLayerInstructionInput) => void;
  selectInstruction: (artifact: AgentLayerInstructionArtifact) => boolean;
  newInstruction: (kind: AgentLayerInstructionKind) => boolean;
  copyInstruction: (artifact: AgentLayerInstructionArtifact) => boolean;
  updateBinding: (input: AgentLayerBindingInput) => void;
  selectBinding: (artifact: AgentLayerBindingArtifact) => boolean;
  newBinding: (kind: AgentLayerBindingKind) => boolean;
  copyBinding: (artifact: AgentLayerBindingArtifact) => boolean;
  updateWorkflow: (input: AgentLayerWorkflowInput) => void;
  selectWorkflow: (artifact: WorkflowDefinition) => boolean;
  newWorkflow: () => boolean;
  copyWorkflow: (artifact: WorkflowDefinition) => boolean;
  /** Возвращает false, когда пользователь отменил выход либо идёт запись. */
  close: () => boolean;
  reset: () => void;
  save: () => Promise<void>;
  remove: () => Promise<void>;
  /** true означает подтверждённую загрузку и очистку формы; false сохраняет контекст. */
  selectDraft: (id: string) => Promise<boolean>;
  createDraft: (copySelected?: boolean) => Promise<boolean>;
  refresh: () => Promise<boolean>;
  validate: () => Promise<void>;
  retry: () => Promise<void>;
};
export type UseAgentLayerEditorOptions = {
  configuration: UseAgentLayerConfigurationResult;
};
