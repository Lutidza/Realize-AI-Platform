/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerRuleRemoval.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Удаляет только неиспользуемое правило, не меняя другие артефакты и ссылки.
 */
import {
  ContractValidationError,
  parseUpdateAIConfigDraftInput,
} from "@realize/ai-contracts";
import type {
  AIConfigDraftDTO,
  UpdateAIConfigDraftInput,
} from "@realize/ai-contracts";
import { getAgentLayerRuleReferences } from "./getAgentLayerRuleReferences.util";
export const buildAgentLayerRuleRemoval = (
  draft: AIConfigDraftDTO,
  key: string,
): UpdateAIConfigDraftInput => {
  if (draft.state === "released" || draft.state === "validating")
    throw new ContractValidationError(
      "Этот черновик доступен только для чтения. Создайте копию.",
    );
  if (
    !draft.artifacts.some(
      (artifact) => artifact.kind === "local_rule" && artifact.key === key,
    )
  )
    throw new ContractValidationError(
      "Правило не найдено в текущем черновике.",
    );
  const references = getAgentLayerRuleReferences(draft, key);
  if (references.length)
    throw new ContractValidationError(
      `Нельзя удалить правило: его используют профили ${references.map((value) => value.title || value.key).join(", ")}.`,
    );
  return parseUpdateAIConfigDraftInput({
    artifacts: draft.artifacts.filter(
      (artifact) => artifact.kind !== "local_rule" || artifact.key !== key,
    ),
    baseRelease: draft.baseRelease ?? null,
    expectedRevision: draft.revision,
    schemaVersion: "1.0",
  });
};
