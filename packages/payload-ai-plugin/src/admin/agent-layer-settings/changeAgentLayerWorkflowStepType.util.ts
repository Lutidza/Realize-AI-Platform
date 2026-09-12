/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/changeAgentLayerWorkflowStepType.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Заменяет тип шага по явному действию, сохраняя общую идентичность и совместимые поля перехода.
 */

import type { WorkflowStep } from "@realize/ai-contracts";
import type { AgentLayerWorkflowStepInput } from "./AgentLayerWorkflow.types";
import { createAgentLayerWorkflowStep } from "./createAgentLayerWorkflowStep.util";

/** Подтверждение потери несовместимых полей принадлежит вызывающему редактору. */
export const changeAgentLayerWorkflowStepType = (
  source: AgentLayerWorkflowStepInput,
  type: WorkflowStep["type"],
): AgentLayerWorkflowStepInput => {
  if (source.type === type) return structuredClone(source);
  const next = {
    ...createAgentLayerWorkflowStep(type, []),
    id: source.id,
    key: source.key,
    keyInput: source.keyInput,
  };
  if ("nextStepKey" in next && "nextStepKey" in source)
    next.nextStepKey = source.nextStepKey;
  if ("promptTemplateKey" in next && "promptTemplateKey" in source)
    next.promptTemplateKey = source.promptTemplateKey;
  return next;
};
