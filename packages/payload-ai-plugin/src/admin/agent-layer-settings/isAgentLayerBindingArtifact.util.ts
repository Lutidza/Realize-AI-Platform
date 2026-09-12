/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/isAgentLayerBindingArtifact.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Сужает вид записи до поддержанных редакторов возможностей и проверок.
 */

import type { AIConfigArtifact } from "@realize/ai-contracts";
import type { AgentLayerBindingArtifact } from "./AgentLayerBinding.types";

export const isAgentLayerBindingArtifact = (
  artifact: AIConfigArtifact,
): artifact is AgentLayerBindingArtifact =>
  artifact.kind === "capability_binding" || artifact.kind === "check_binding";
