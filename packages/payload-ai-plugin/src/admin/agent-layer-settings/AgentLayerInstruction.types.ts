/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerInstruction.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт различимые редактируемые контракты роли, навыка и шаблона инструкции.
 */

import type {
  AILocalRoleDefinition,
  AIPromptTemplateDefinition,
  AISkillDefinition,
} from "@realize/ai-contracts";

export type AgentLayerInstructionArtifact =
  AILocalRoleDefinition | AISkillDefinition | AIPromptTemplateDefinition;
export type AgentLayerInstructionKind = AgentLayerInstructionArtifact["kind"];

/** Вид остаётся частью формы; монотонной revision владеет mapper aggregate update. */
export type AgentLayerInstructionInput =
  | Omit<AILocalRoleDefinition, "revision">
  | Omit<AISkillDefinition, "revision">
  | Omit<AIPromptTemplateDefinition, "revision">;
