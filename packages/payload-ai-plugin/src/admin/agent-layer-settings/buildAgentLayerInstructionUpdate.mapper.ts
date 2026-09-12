/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerInstructionUpdate.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Передаёт сохранение роли, навыка или шаблона в общий mapper aggregate update.
 */

import { ContractValidationError } from "@realize/ai-contracts";
import type {
  AIConfigDraftDTO,
  UpdateAIConfigDraftInput,
} from "@realize/ai-contracts";
import type { AgentLayerInstructionInput } from "./AgentLayerInstruction.types";
import { buildAgentLayerArtifactUpdate } from "./buildAgentLayerArtifactUpdate.mapper";
import { validateAgentLayerInstructionInput } from "./validateAgentLayerInstructionInput.validator";

/** Сохранённая identity не меняется; копия передаётся без originalKey и получает revision 1. */
export const buildAgentLayerInstructionUpdate = (
  draft: AIConfigDraftDTO,
  input: AgentLayerInstructionInput,
  originalKey?: string,
): UpdateAIConfigDraftInput => {
  const error = validateAgentLayerInstructionInput(input);
  if (error) throw new ContractValidationError(error);
  if (originalKey !== undefined && originalKey !== input.key)
    throw new ContractValidationError(
      "Сохранённый ключ не меняется. Создайте копию с новым ключом.",
    );
  return buildAgentLayerArtifactUpdate(
    draft,
    { ...input, revision: 1 },
    originalKey,
  );
};
