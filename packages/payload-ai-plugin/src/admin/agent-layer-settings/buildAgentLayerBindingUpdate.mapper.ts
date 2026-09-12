/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerBindingUpdate.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Преобразует поля связи в aggregate update с точной идентичностью и наследуемыми ограничениями.
 */

import { ContractValidationError } from "@realize/ai-contracts";
import type {
  AIConfigDraftDTO,
  UpdateAIConfigDraftInput,
} from "@realize/ai-contracts";
import type { AgentLayerBindingInput } from "./AgentLayerBinding.types";
import { buildAgentLayerArtifactUpdate } from "./buildAgentLayerArtifactUpdate.mapper";
import { validateAgentLayerBindingInput } from "./validateAgentLayerBindingInput.validator";

/** Числовое преобразование выполняется после проверки; отсутствующие scopes не заменяются пустыми массивами. */
export const buildAgentLayerBindingUpdate = (
  draft: AIConfigDraftDTO,
  input: AgentLayerBindingInput,
  originalKey?: string,
): UpdateAIConfigDraftInput => {
  const error = validateAgentLayerBindingInput(input);
  if (error) throw new ContractValidationError(error);
  if (originalKey !== undefined && originalKey !== input.key)
    throw new ContractValidationError(
      "Сохранённый ключ не меняется. Создайте копию с новым ключом.",
    );
  if (input.kind === "check_binding")
    return buildAgentLayerArtifactUpdate(
      draft,
      { ...input, revision: 1 },
      originalKey,
    );
  const { maxTargets, ...fields } = input;
  return buildAgentLayerArtifactUpdate(
    draft,
    {
      ...fields,
      ...(maxTargets === "" ? {} : { maxTargets: Number(maxTargets) }),
      revision: 1,
    },
    originalKey,
  );
};
