/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerWorkflowLiteralInput.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Создаёт начальное значение явно выбранного типа литерала процесса.
 */

import type { AgentLayerWorkflowLiteralInput } from "./AgentLayerWorkflow.types";

export const createAgentLayerWorkflowLiteralInput = (
  type: AgentLayerWorkflowLiteralInput["type"],
): AgentLayerWorkflowLiteralInput => {
  if (type === "null") return { type };
  if (type === "boolean") return { type, value: false };
  if (type === "string") return { type, value: "" };
  return {
    type,
    valueText: type === "array" ? "[]" : type === "object" ? "{}" : "",
  };
};
