/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerDraftInput.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Создаёт вход нового draft с явным lineage и начальными версиями всех артефактов.
 */
import { parseCreateAIConfigDraftInput } from "@realize/ai-contracts";
import type {
  AIConfigDraftDTO,
  CreateAIConfigDraftInput,
} from "@realize/ai-contracts";
export const buildAgentLayerDraftInput = (
  draftID: string,
  source?: AIConfigDraftDTO,
): CreateAIConfigDraftInput =>
  parseCreateAIConfigDraftInput({
    draftID,
    schemaVersion: "1.0",
    expectedRevision: 0,
    baseRelease: source?.baseRelease ?? null,
    artifacts:
      source?.artifacts.map((artifact) => ({ ...artifact, revision: 1 })) ?? [],
  });
