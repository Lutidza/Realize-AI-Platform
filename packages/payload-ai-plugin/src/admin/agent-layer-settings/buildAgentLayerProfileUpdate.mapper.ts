/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerProfileUpdate.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Преобразует сохранение профиля со стабильным ключом в существующий aggregate Config API.
 */

import { ContractValidationError } from "@realize/ai-contracts";
import type {
  AIConfigDraftDTO,
  UpdateAIConfigDraftInput,
} from "@realize/ai-contracts";
import type { AgentLayerProfileInput } from "./AgentLayerConfiguration.types";
import { buildAgentLayerArtifactUpdate } from "./buildAgentLayerArtifactUpdate.mapper";
import { validateAgentLayerProfileInput } from "./validateAgentLayerProfileInput.validator";

/** originalKey отсутствует только при создании; существующий профиль не переименовывается. */
export const buildAgentLayerProfileUpdate = (
  draft: AIConfigDraftDTO,
  input: AgentLayerProfileInput,
  originalKey?: string,
): UpdateAIConfigDraftInput => {
  const error = validateAgentLayerProfileInput(input);
  if (error) throw new ContractValidationError(error);
  if (originalKey !== undefined && originalKey !== input.key) {
    throw new ContractValidationError(
      "Сохранённый ключ профиля не меняется. Создайте копию с новым ключом.",
    );
  }
  return buildAgentLayerArtifactUpdate(
    draft,
    { ...input, kind: "agent_profile", revision: 1 },
    originalKey,
  );
};
