/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerBinding.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт различимые формы связей возможностей и системных проверок.
 */

import type {
  AICapabilityBindingDefinition,
  AICheckBindingDefinition,
} from "@realize/ai-contracts";

export type AgentLayerBindingArtifact =
  AICapabilityBindingDefinition | AICheckBindingDefinition;
export type AgentLayerBindingKind = AgentLayerBindingArtifact["kind"];

/** Пустой maxTargets наследует лимит; undefined scopes наследуют области, [] запрещает их. */
export type AgentLayerBindingInput =
  | (Omit<AICapabilityBindingDefinition, "revision" | "maxTargets"> & {
      maxTargets: string;
    })
  | Omit<AICheckBindingDefinition, "revision">;
