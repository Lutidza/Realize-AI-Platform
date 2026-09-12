/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerInstructionFields.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Создаёт отделённые поля роли, навыка или шаблона из сохранённой записи либо выбранного вида.
 */

import type {
  AgentLayerInstructionArtifact,
  AgentLayerInstructionInput,
  AgentLayerInstructionKind,
} from "./AgentLayerInstruction.types";

/** Новый вид получает пустые поля; сохранённая запись передаёт только редактируемый allowlist. */
export const getAgentLayerInstructionFields = (
  kindOrSource: AgentLayerInstructionKind | AgentLayerInstructionArtifact,
): AgentLayerInstructionInput => {
  const source = typeof kindOrSource === "string" ? undefined : kindOrSource;
  const kind =
    typeof kindOrSource === "string" ? kindOrSource : kindOrSource.kind;
  const base = {
    key: source?.key ?? "",
    title: source?.title ?? "",
    enabled: source?.enabled ?? true,
  };
  switch (kind) {
    case "local_role":
      return {
        ...base,
        kind,
        instructions: source?.kind === kind ? source.instructions : "",
        capabilityBindingKeys:
          source?.kind === kind ? [...source.capabilityBindingKeys] : [],
      };
    case "skill":
      return {
        ...base,
        kind,
        description: source?.kind === kind ? source.description : "",
        instructions: source?.kind === kind ? source.instructions : "",
        capabilityBindingKeys:
          source?.kind === kind ? [...source.capabilityBindingKeys] : [],
        triggerTerms: source?.kind === kind ? [...source.triggerTerms] : [],
      };
    case "prompt_template":
      return {
        ...base,
        kind,
        slot: source?.kind === kind ? source.slot : "agent_instructions",
        template: source?.kind === kind ? source.template : "",
        variables: source?.kind === kind ? [...source.variables] : [],
      };
  }
};
