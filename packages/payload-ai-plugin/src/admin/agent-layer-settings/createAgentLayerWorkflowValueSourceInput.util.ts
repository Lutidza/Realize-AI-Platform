/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerWorkflowValueSourceInput.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Создаёт типизированные поля явно выбранного источника значения процесса.
 */

import type { AgentLayerWorkflowValueSourceInput } from "./AgentLayerWorkflow.types";

export const createAgentLayerWorkflowValueSourceInput = (
  source: AgentLayerWorkflowValueSourceInput["source"],
): AgentLayerWorkflowValueSourceInput => {
  if (source === "literal")
    return { source, value: { type: "string", value: "" } };
  return source === "input"
    ? { source, path: "" }
    : { source, path: "", stepKey: "" };
};
