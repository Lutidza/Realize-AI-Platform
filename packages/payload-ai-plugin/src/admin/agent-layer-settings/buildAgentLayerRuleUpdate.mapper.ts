/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerRuleUpdate.mapper.ts
 * @version 1.0.1
 * @date 2026-09-10
 * @description Проверяет поля и защиту ссылок правила перед общей сборкой aggregate update.
 */
import { ContractValidationError } from "@realize/ai-contracts";
import type {
  AIConfigDraftDTO,
  UpdateAIConfigDraftInput,
} from "@realize/ai-contracts";
import type { AgentLayerRuleInput } from "./AgentLayerConfiguration.types";
import { buildAgentLayerArtifactUpdate } from "./buildAgentLayerArtifactUpdate.mapper";
import { getAgentLayerRuleReferences } from "./getAgentLayerRuleReferences.util";

/** Изменение ключа не переписывает ссылки профилей автоматически. */
export const buildAgentLayerRuleUpdate = (
  draft: AIConfigDraftDTO,
  input: AgentLayerRuleInput,
  originalKey?: string,
): UpdateAIConfigDraftInput => {
  if (originalKey && originalKey !== input.key) {
    const references = getAgentLayerRuleReferences(draft, originalKey);
    if (references.length) {
      throw new ContractValidationError(
        `Нельзя изменить ключ: правило используется профилями ${references.map((value) => value.title || value.key).join(", ")}.`,
      );
    }
  }
  if (!input.title.trim() || !input.instruction.trim()) {
    throw new ContractValidationError("Укажите название и инструкцию правила.");
  }
  return buildAgentLayerArtifactUpdate(
    draft,
    { ...input, kind: "local_rule", revision: 1 },
    originalKey,
  );
};
