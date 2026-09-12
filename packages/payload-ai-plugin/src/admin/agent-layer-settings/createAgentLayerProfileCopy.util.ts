/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerProfileCopy.util.ts
 * @version 1.0.1
 * @date 2026-09-10
 * @description Готовит несохранённую копию профиля с уникальным ключом и независимыми массивами связей.
 */

import type {
  AIAgentProfileDefinition,
  AIConfigArtifact,
} from "@realize/ai-contracts";
import type { AgentLayerProfileInput } from "./AgentLayerConfiguration.types";
import { getAgentLayerProfileFields } from "./getAgentLayerProfileFields.util";
import { createAgentLayerArtifactCopyIdentity } from "./createAgentLayerArtifactCopyIdentity.util";

/** Проверяет коллизии только среди профилей и не записывает копию в конфигурацию. */
export const createAgentLayerProfileCopy = (
  source: AIAgentProfileDefinition,
  artifacts: readonly AIConfigArtifact[],
): AgentLayerProfileInput => ({
  ...getAgentLayerProfileFields(source),
  ...createAgentLayerArtifactCopyIdentity(source, artifacts),
});
