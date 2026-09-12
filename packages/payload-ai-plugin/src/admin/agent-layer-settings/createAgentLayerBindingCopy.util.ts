/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerBindingCopy.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Готовит независимую локальную копию связи с уникальным ключом того же вида.
 */

import type { AIConfigArtifact } from "@realize/ai-contracts";
import type {
  AgentLayerBindingArtifact,
  AgentLayerBindingInput,
} from "./AgentLayerBinding.types";
import { createAgentLayerArtifactCopyIdentity } from "./createAgentLayerArtifactCopyIdentity.util";
import { getAgentLayerBindingFields } from "./getAgentLayerBindingFields.util";

/** Exact ссылка, ограничения и их порядок сохраняются; запись появится только после сохранения. */
export const createAgentLayerBindingCopy = (
  source: AgentLayerBindingArtifact,
  artifacts: readonly AIConfigArtifact[],
): AgentLayerBindingInput => ({
  ...getAgentLayerBindingFields(source),
  ...createAgentLayerArtifactCopyIdentity(source, artifacts),
});
