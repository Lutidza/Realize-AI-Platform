/**
 * @file packages/change-engine/src/workflowValueResolution.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Разрешает значения и условия workflow без выражений и prototype traversal.
 */

import {
  parseWorkflowJSONValue,
  type JSONValue,
  type WorkflowCheckpoint,
  type WorkflowCondition,
  type WorkflowValueResolution,
  type WorkflowValueSource,
  type CapabilityWorkflowStep,
} from "@realize/ai-contracts";
import { AIConfigurationPolicyError } from "./aiConfigurationError";
import { canonicalizeJSON } from "./canonicalJson";

const ownValue = (value: JSONValue, key: string): WorkflowValueResolution => {
  if (!value || typeof value !== "object") return { found: false };
  if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))
    return { found: false };
  const property = Object.getOwnPropertyDescriptor(value, key);
  if (!property?.enumerable || !("value" in property)) return { found: false };
  return { found: true, value: parseWorkflowJSONValue(property.value) };
};

/** Exact own key имеет приоритет; остальные nested paths допускаются только как RFC 6901 JSON Pointer. */
export const resolveWorkflowValue = (
  source: WorkflowValueSource,
  checkpoint: WorkflowCheckpoint,
): WorkflowValueResolution => {
  if (source.source === "literal")
    return { found: true, value: parseWorkflowJSONValue(source.value) };
  const root: WorkflowValueResolution =
    source.source === "input"
      ? { found: true, value: checkpoint.input }
      : ownValue(checkpoint.outputs, source.stepKey);
  if (!root.found) return root;
  const { value } = root;
  const exact = ownValue(value, source.path);
  if (exact.found) return exact;
  if (!source.path.startsWith("/") || /~(?![01])/.test(source.path))
    return { found: false };
  let resolved: WorkflowValueResolution = { found: true, value };
  for (const token of source.path.slice(1).split("/")) {
    if (!resolved.found) return resolved;
    resolved = ownValue(
      resolved.value,
      token.replaceAll("~1", "/").replaceAll("~0", "~"),
    );
  }
  return resolved;
};

/** Сравнение JSON детерминировано; missing operand не подменяется null/undefined. */
export const evaluateWorkflowCondition = (
  condition: WorkflowCondition,
  checkpoint: WorkflowCheckpoint,
): boolean => {
  const left = resolveWorkflowValue(condition.left, checkpoint);
  if (condition.operator === "exists") return left.found;
  const right =
    condition.right && resolveWorkflowValue(condition.right, checkpoint);
  if (!left.found || !right?.found)
    throw new AIConfigurationPolicyError(
      "Для сравнения отсутствует значение workflow.",
    );
  const equal = canonicalizeJSON(left.value) === canonicalizeJSON(right.value);
  return condition.operator === "equals" ? equal : !equal;
};

/** Typed intent содержит только явно объявленные поля, каждый источник обязан существовать. */
export const resolveWorkflowCapabilityInput = (
  step: CapabilityWorkflowStep,
  checkpoint: WorkflowCheckpoint,
): Record<string, JSONValue> =>
  Object.fromEntries(
    Object.entries(step.input).map(([key, source]) => {
      const resolved = resolveWorkflowValue(source, checkpoint);
      if (!resolved.found)
        throw new AIConfigurationPolicyError(
          `Отсутствует значение параметра ${key} шага ${step.key}.`,
        );
      return [key, resolved.value];
    }),
  );
