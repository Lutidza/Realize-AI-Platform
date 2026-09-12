/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerWorkflowUpdate.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Передаёт сохранение процесса в общий aggregate mapper с неизменяемым ключом и точной ревизией.
 */

import { ContractValidationError } from "@realize/ai-contracts";
import type {
  AIConfigDraftDTO,
  UpdateAIConfigDraftInput,
} from "@realize/ai-contracts";
import type { AgentLayerWorkflowInput } from "./AgentLayerWorkflow.types";
import { buildAgentLayerArtifactUpdate } from "./buildAgentLayerArtifactUpdate.mapper";
import { toAgentLayerWorkflowArtifact } from "./toAgentLayerWorkflowArtifact.mapper";
import { validateAgentLayerWorkflowInput } from "./validateAgentLayerWorkflowInput.validator";

/** Остальные artifacts и lineage сохраняются; новый процесс получает revision 1. */
export const buildAgentLayerWorkflowUpdate = (
  draft: AIConfigDraftDTO,
  input: AgentLayerWorkflowInput,
  originalKey?: string,
): UpdateAIConfigDraftInput => {
  const error = validateAgentLayerWorkflowInput(input);
  if (error) throw new ContractValidationError(error);
  if (originalKey !== undefined && originalKey !== input.key)
    throw new ContractValidationError(
      "Сохранённый ключ не меняется. Создайте копию с новым ключом.",
    );
  return buildAgentLayerArtifactUpdate(
    draft,
    toAgentLayerWorkflowArtifact(input),
    originalKey,
  );
};
