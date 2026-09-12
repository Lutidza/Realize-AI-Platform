/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerWorkflowStepRemovalError.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Объясняет, какие ссылки не позволяют удалить шаг без повреждения процесса.
 */

import type {
  AgentLayerWorkflowInput,
  AgentLayerWorkflowValueSourceInput,
} from "./AgentLayerWorkflow.types";

/** Дубликат можно убрать, когда другой шаг с тем же ключом сохраняет существующие ссылки. */
export const getAgentLayerWorkflowStepRemovalError = (
  input: AgentLayerWorkflowInput,
  stepID: string,
): string | undefined => {
  const source = input.steps.find((step) => step.id === stepID);
  if (!source) return "Шаг больше не найден в форме.";
  if (input.steps.some((step) => step.id !== stepID && step.key === source.key))
    return undefined;
  const references: string[] = [];
  const refers = (value?: AgentLayerWorkflowValueSourceInput) =>
    value?.source === "step_output" && value.stepKey === source.key;
  if (input.entryStepKey === source.key)
    references.push("начальный шаг процесса");
  input.steps.forEach((step) => {
    if (step.id === stepID) return;
    const isTransition =
      step.type === "branch"
        ? step.trueStepKey === source.key || step.falseStepKey === source.key
        : "nextStepKey" in step && step.nextStepKey === source.key;
    const isOutput =
      step.type === "capability"
        ? step.input.some((field) => refers(field.value))
        : step.type === "branch" &&
          (refers(step.condition.left) || refers(step.condition.right));
    if (isTransition || isOutput) references.push(`шаг «${step.key}»`);
  });
  if (!references.length) return undefined;
  return `Нельзя удалить шаг: на него ссылаются ${references.slice(0, 5).join(", ")}${references.length > 5 ? ` и ещё ${references.length - 5}` : ""}. Сначала измените эти ссылки.`;
};
