/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/mergeAgentLayerDraftSummary.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Обновляет обзор подтверждённым draft DTO, сохраняя system, releases и active pointer.
 */
import type {
  AIConfigBootstrapDTO,
  AIConfigDraftDTO,
  AIConfigDraftSummaryDTO,
} from "@realize/ai-contracts";
export const mergeAgentLayerDraftSummary = (
  bootstrap: AIConfigBootstrapDTO,
  draft: AIConfigDraftDTO,
): AIConfigBootstrapDTO => {
  const summary: AIConfigDraftSummaryDTO = {
    id: draft.id,
    artifactCount: draft.artifactCount,
    baseRelease: draft.baseRelease,
    createdAt: draft.createdAt,
    createdBy: draft.createdBy,
    revision: draft.revision,
    schemaVersion: draft.schemaVersion,
    state: draft.state,
    updatedAt: draft.updatedAt,
    updatedBy: draft.updatedBy,
  };
  return {
    ...bootstrap,
    drafts: [
      summary,
      ...bootstrap.drafts.filter((value) => value.id !== draft.id),
    ],
  };
};
