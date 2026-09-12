/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/createAgentLayerWorkflowStep.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Создаёт локальный шаг выбранного вида с независимой идентичностью и незаполненными связями.
 */

import type { WorkflowStep } from "@realize/ai-contracts";
import type { AgentLayerWorkflowStepInput } from "./AgentLayerWorkflow.types";

/** Незаданные переходы и цели остаются пустыми полями, а не фиктивными сохранёнными ссылками. */
export const createAgentLayerWorkflowStep = (
  type: WorkflowStep["type"],
  steps: readonly AgentLayerWorkflowStepInput[],
): AgentLayerWorkflowStepInput => {
  let index = 1;
  while (steps.some((step) => step.key === `step.${type}.${index}`)) index++;
  const key = `step.${type}.${index}`;
  let idIndex = 0;
  while (steps.some((step) => step.id === `step-row-${idIndex}`)) idIndex++;
  const base = { id: `step-row-${idIndex}`, key, keyInput: key };
  switch (type) {
    case "finish":
      return { ...base, type, outcome: "completed" };
    case "branch":
      return {
        ...base,
        type,
        falseStepKey: "",
        trueStepKey: "",
        condition: { left: { source: "input", path: "" }, operator: "exists" },
      };
    case "capability":
      return {
        ...base,
        type,
        nextStepKey: "",
        capabilityBindingKey: "",
        input: [],
      };
    case "check":
      return { ...base, type, nextStepKey: "", checkBindingKey: "" };
    case "agent_turn":
    case "request_input":
      return { ...base, type, nextStepKey: "", promptTemplateKey: "" };
  }
};
