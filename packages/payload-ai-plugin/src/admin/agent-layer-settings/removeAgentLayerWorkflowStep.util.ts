/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/removeAgentLayerWorkflowStep.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Удаляет только шаг без сохраняемых входящих ссылок и не изменяет остальные поля процесса.
 */

import { ContractValidationError } from "@realize/ai-contracts";
import type { AgentLayerWorkflowInput } from "./AgentLayerWorkflow.types";
import { getAgentLayerWorkflowStepRemovalError } from "./getAgentLayerWorkflowStepRemovalError.util";

export const removeAgentLayerWorkflowStep = (
  input: AgentLayerWorkflowInput,
  stepID: string,
): AgentLayerWorkflowInput => {
  const error = getAgentLayerWorkflowStepRemovalError(input, stepID);
  if (error) throw new ContractValidationError(error);
  return structuredClone({
    ...input,
    steps: input.steps.filter((step) => step.id !== stepID),
  });
};
