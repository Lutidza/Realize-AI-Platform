/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/validateAgentLayerWorkflowInput.validator.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет поля процесса перед записью, оставляя семантическую проверку графа серверу.
 */

import type { AgentLayerWorkflowInput } from "./AgentLayerWorkflow.types";
import { toAgentLayerWorkflowArtifact } from "./toAgentLayerWorkflowArtifact.mapper";

/** Pending rename и неверный ввод не преобразуются в незаметно исправленное значение. */
export const validateAgentLayerWorkflowInput = (
  input: AgentLayerWorkflowInput,
): string | undefined => {
  if (
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 120
  )
    return "Название: укажите непустой текст длиной до 120 символов.";
  if (
    typeof input.description !== "string" ||
    !input.description.trim() ||
    input.description.length > 2000
  )
    return "Назначение процесса: укажите непустой текст длиной до 2000 символов.";
  try {
    toAgentLayerWorkflowArtifact(input);
    return undefined;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Проверьте поля рабочего процесса.";
  }
};
