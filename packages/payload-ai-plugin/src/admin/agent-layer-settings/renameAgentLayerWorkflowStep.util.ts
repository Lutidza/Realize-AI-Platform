/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/renameAgentLayerWorkflowStep.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Применяет новый ключ шага атомарно вместе с переходами, началом процесса и ссылками на результат.
 */

import { ContractValidationError } from "@realize/ai-contracts";
import type {
  AgentLayerWorkflowInput,
  AgentLayerWorkflowValueSourceInput,
} from "./AgentLayerWorkflow.types";

/** Неоднозначный прежний ключ сначала исправляется удалением лишнего дубликата без потери оставшихся ссылок. */
export const renameAgentLayerWorkflowStep = (
  input: AgentLayerWorkflowInput,
  stepID: string,
): AgentLayerWorkflowInput => {
  const source = input.steps.find((step) => step.id === stepID);
  if (!source)
    throw new ContractValidationError("Шаг больше не найден в форме.");
  const key = source.keyInput;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key))
    throw new ContractValidationError(
      "Ключ шага: от 1 до 128 латинских букв, цифр, точек, дефисов или подчёркиваний; первый символ — буква или цифра.",
    );
  if (input.steps.some((step) => step.id !== stepID && step.key === key))
    throw new ContractValidationError("Шаг с таким ключом уже существует.");
  if (input.steps.some((step) => step.id !== stepID && step.key === source.key))
    throw new ContractValidationError(
      "Прежний ключ используется несколькими шагами. Удалите лишний дубликат перед переименованием, чтобы сохранить ссылки однозначными.",
    );
  const result = structuredClone(input);
  const rewrite = (value: string) => (value === source.key ? key : value);
  const rewriteValue = (
    value: AgentLayerWorkflowValueSourceInput,
  ): AgentLayerWorkflowValueSourceInput =>
    value.source === "step_output"
      ? { ...value, stepKey: rewrite(value.stepKey) }
      : value;
  result.entryStepKey = rewrite(result.entryStepKey);
  result.steps = result.steps.map((step) => {
    const identity = step.id === stepID ? { key, keyInput: key } : {};
    switch (step.type) {
      case "branch":
        return {
          ...step,
          ...identity,
          trueStepKey: rewrite(step.trueStepKey),
          falseStepKey: rewrite(step.falseStepKey),
          condition: {
            ...step.condition,
            left: rewriteValue(step.condition.left),
            ...(step.condition.right === undefined
              ? {}
              : { right: rewriteValue(step.condition.right) }),
          },
        };
      case "capability":
        return {
          ...step,
          ...identity,
          nextStepKey: rewrite(step.nextStepKey),
          input: step.input.map((field) => ({
            ...field,
            value: rewriteValue(field.value),
          })),
        };
      case "finish":
        return { ...step, ...identity };
      default:
        return { ...step, ...identity, nextStepKey: rewrite(step.nextStepKey) };
    }
  });
  return result;
};
