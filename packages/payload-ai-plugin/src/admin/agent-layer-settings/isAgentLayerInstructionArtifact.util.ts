/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/isAgentLayerInstructionArtifact.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Сужает вид записи до поддержанных редакторов роли, навыка и шаблона.
 */

import type { AIConfigArtifact } from "@realize/ai-contracts";
import type { AgentLayerInstructionArtifact } from "./AgentLayerInstruction.types";

export const isAgentLayerInstructionArtifact = (
  artifact: AIConfigArtifact,
): artifact is AgentLayerInstructionArtifact =>
  artifact.kind === "local_role" ||
  artifact.kind === "skill" ||
  artifact.kind === "prompt_template";
