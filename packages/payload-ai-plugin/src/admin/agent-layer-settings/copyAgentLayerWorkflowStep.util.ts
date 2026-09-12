/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/copyAgentLayerWorkflowStep.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Копирует локальный шаг с новым ключом, сохраняя значения и ссылки исходного шага.
 */

import type { AgentLayerWorkflowStepInput } from "./AgentLayerWorkflow.types";
import { createAgentLayerWorkflowStep } from "./createAgentLayerWorkflowStep.util";

/** Копия не перенаправляет входящие ссылки и не меняет существующие переходы. */
export const copyAgentLayerWorkflowStep = (
  source: AgentLayerWorkflowStepInput,
  steps: readonly AgentLayerWorkflowStepInput[],
): AgentLayerWorkflowStepInput => {
  let ordinal = 1;
  let key: string;
  do {
    const suffix = ordinal === 1 ? ".copy" : `.copy-${ordinal}`;
    key = `${source.key.slice(0, 128 - suffix.length)}${suffix}`;
    ordinal++;
  } while (steps.some((step) => step.key === key));
  const { id } = createAgentLayerWorkflowStep(source.type, steps);
  return { ...structuredClone(source), id, key, keyInput: key };
};
