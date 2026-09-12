/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerWorkflowCopy.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Создаёт независимую локальную копию процесса, сохраняя внутренние шаги и внешние ссылки.
 */

import type {
  AIConfigArtifact,
  WorkflowDefinition,
} from "@realize/ai-contracts";
import type { AgentLayerWorkflowInput } from "./AgentLayerWorkflow.types";
import { createAgentLayerArtifactCopyIdentity } from "./createAgentLayerArtifactCopyIdentity.util";
import { getAgentLayerWorkflowFields } from "./getAgentLayerWorkflowFields.util";

export const createAgentLayerWorkflowCopy = (
  source: WorkflowDefinition,
  artifacts: readonly AIConfigArtifact[],
): AgentLayerWorkflowInput => ({
  ...getAgentLayerWorkflowFields(source),
  ...createAgentLayerArtifactCopyIdentity(source, artifacts),
});
