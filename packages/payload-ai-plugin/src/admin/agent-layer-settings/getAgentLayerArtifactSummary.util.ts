/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerArtifactSummary.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Собирает краткое содержательное описание записи для каталога агентского слоя.
 */

import type { AIConfigArtifact } from "@realize/ai-contracts";

/** Использует только сохранённые поля; не подменяет связи фактом runtime-применения. */
export const getAgentLayerArtifactSummary = (
  artifact: AIConfigArtifact,
): string => {
  switch (artifact.kind) {
    case "agent_profile":
    case "skill":
    case "workflow_definition":
      return artifact.description;
    case "local_role":
      return artifact.instructions;
    case "local_rule":
      return artifact.instruction;
    case "prompt_template":
      return artifact.template;
    case "capability_binding":
      return `${artifact.capability.id} · ${artifact.allowedActions.join(", ")}`;
    case "check_binding":
      return artifact.checkID;
  }
};
