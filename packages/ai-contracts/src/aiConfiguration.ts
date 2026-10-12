/**
 * @file packages/ai-contracts/src/aiConfiguration.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Задаёт versioned draft, release, pointer и installation artifact contracts.
 * @docref Realize — AI Platform v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { CapabilityDescriptor, CapabilityReference } from "./capabilities";
import type { WorkflowDefinition } from "./workflows";

type AIConfigArtifactBase<TKind extends string> = {
  enabled: boolean;
  key: string;
  kind: TKind;
  revision: number;
  title: string;
};

/** Повторно используемая локальная процедура с явными capability bindings. */
export type AISkillDefinition = AIConfigArtifactBase<"skill"> & {
  capabilityBindingKeys: readonly string[];
  description: string;
  instructions: string;
  triggerTerms: readonly string[];
};

/** Шаблон инструкции с именованными runtime variables. */
export type AIPromptTemplateDefinition =
  AIConfigArtifactBase<"prompt_template"> & {
    slot: "agent_instructions" | "planner" | "reviewer" | "workflow_step";
    template: string;
    variables: readonly string[];
  };

/** Локальное installation-правило с детерминированным приоритетом. */
export type AILocalRuleDefinition = AIConfigArtifactBase<"local_rule"> & {
  instruction: string;
  priority: number;
};

/** Роль агента, не смешанная с actor authorization role. */
export type AILocalRoleDefinition = AIConfigArtifactBase<"local_role"> & {
  capabilityBindingKeys: readonly string[];
  instructions: string;
};

/** Installation binding может только выбирать или сужать system capability. */
export type AICapabilityBindingDefinition =
  AIConfigArtifactBase<"capability_binding"> & {
    allowedActions: readonly string[];
    capability: CapabilityReference;
    maxTargets?: number;
    readScopes?: readonly string[];
    writeScopes?: readonly string[];
  };

/** Ссылка на стабильный server check ID, а не произвольную команду. */
export type AICheckBindingDefinition = AIConfigArtifactBase<"check_binding"> & {
  checkID: string;
};

/** Собирает effective инструкции и bindings одного installation agent. */
export type AIAgentProfileDefinition = AIConfigArtifactBase<"agent_profile"> & {
  capabilityBindingKeys: readonly string[];
  checkBindingKeys: readonly string[];
  defaultWorkflowKey?: string;
  description: string;
  locale: string;
  promptTemplateKeys: readonly string[];
  roleKeys: readonly string[];
  ruleKeys: readonly string[];
  skillKeys: readonly string[];
  workflowKeys: readonly string[];
};

/** Typed artifacts, поддерживаемые первым configuration foundation slice. */
export type AIConfigArtifact =
  | AIAgentProfileDefinition
  | AICapabilityBindingDefinition
  | AICheckBindingDefinition
  | AILocalRoleDefinition
  | AILocalRuleDefinition
  | AIPromptTemplateDefinition
  | AISkillDefinition
  | WorkflowDefinition;

/** Stable kind используется вместе с key как уникальная identity artifact. */
export type AIConfigArtifactKind = AIConfigArtifact["kind"];

/** Mutable aggregate, который никогда не используется как runtime source. */
export type AIConfigDraft = {
  artifacts: readonly AIConfigArtifact[];
  baseRelease?: {
    id: string;
    manifestHash: string;
  };
  id: string;
  revision: number;
  schemaVersion: "1.0";
  state: "editing" | "ready" | "released" | "validating";
};

/** Artifact content, связанный с exact canonical SHA-256. */
export type AIConfigArtifactSnapshot = {
  artifact: AIConfigArtifact;
  contentHash: string;
};

/** Полный immutable runtime snapshot одного installation overlay. */
export type AIConfigRelease = {
  artifacts: readonly AIConfigArtifactSnapshot[];
  createdAt: string;
  createdBy: string;
  id: string;
  manifestHash: string;
  schemaVersion: "1.0";
  sourceDraftID: string;
  sourceDraftRevision: number;
  systemCompatibility: {
    maximumRelease?: string;
    minimumRelease: string;
  };
  version: number;
};

/** Versioned singleton pointer, переключаемый activate/rollback command. */
export type ActiveAIConfigPointer = {
  activatedAt: string;
  activatedBy: string;
  manifestHash: string;
  releaseID: string;
  version: number;
};

/** Одна bounded ошибка schema/reference/policy validation. */
export type AIConfigValidationIssue = {
  code: string;
  message: string;
  path: string;
};

/** Результат validation без исключения на первой найденной ошибке. */
export type AIConfigValidationResult =
  | { issues: readonly []; valid: true }
  | { issues: readonly AIConfigValidationIssue[]; valid: false };

/** System ceiling, передаваемый pure configuration compiler. */
export type SystemAIConfigProjection = {
  capabilities: readonly CapabilityDescriptor[];
  checkIDs: readonly string[];
  manifestHash: string;
  projectProfile: string;
  releaseID: string;
  version: string;
};

/** Capability после пересечения system descriptor и installation binding. */
export type ResolvedCapabilityBinding = {
  actions: readonly string[];
  bindingKey: string;
  capability: CapabilityReference;
  maxTargets: number;
  readScopes: readonly string[];
  writeScopes: readonly string[];
};

/** Детерминированная проекция agent profile для последующей сборки Context Pack. */
export type CompiledAgentConfiguration = {
  capabilities: readonly ResolvedCapabilityBinding[];
  checkIDs: readonly string[];
  compiledContextHash: string;
  configManifestHash: string;
  configReleaseID: string;
  profile: AIAgentProfileDefinition;
  projectProfile: string;
  selectedArtifacts: readonly AIConfigArtifactSnapshot[];
  selectedArtifactHashes: readonly string[];
  systemManifestHash: string;
  systemReleaseID: string;
  systemVersion: string;
};
