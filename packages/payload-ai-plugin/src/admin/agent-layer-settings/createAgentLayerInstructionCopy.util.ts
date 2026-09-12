/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerInstructionCopy.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Готовит несохранённую копию инструкции с независимыми полями и уникальным ключом.
 */

import type { AIConfigArtifact } from "@realize/ai-contracts";
import type {
  AgentLayerInstructionArtifact,
  AgentLayerInstructionInput,
} from "./AgentLayerInstruction.types";
import { createAgentLayerArtifactCopyIdentity } from "./createAgentLayerArtifactCopyIdentity.util";
import { getAgentLayerInstructionFields } from "./getAgentLayerInstructionFields.util";

/** Содержимое и порядок списков сохраняются; draft изменится только после Save. */
export const createAgentLayerInstructionCopy = (
  source: AgentLayerInstructionArtifact,
  artifacts: readonly AIConfigArtifact[],
): AgentLayerInstructionInput => ({
  ...getAgentLayerInstructionFields(source),
  ...createAgentLayerArtifactCopyIdentity(source, artifacts),
});
