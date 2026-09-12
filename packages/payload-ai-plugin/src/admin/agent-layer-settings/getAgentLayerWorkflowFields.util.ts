/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerWorkflowFields.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Создаёт независимые поля процесса из canonical DTO без подстановки отсутствующих связей.
 */

import type {
  JSONValue,
  WorkflowDefinition,
  WorkflowValueSource,
} from "@realize/ai-contracts";
import type {
  AgentLayerWorkflowInput,
  AgentLayerWorkflowLiteralInput,
  AgentLayerWorkflowValueSourceInput,
} from "./AgentLayerWorkflow.types";

const literalFields = (value: JSONValue): AgentLayerWorkflowLiteralInput => {
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "string", value };
  if (typeof value === "boolean") return { type: "boolean", value };
  if (typeof value === "number")
    return { type: "number", valueText: String(value) };
  return {
    type: Array.isArray(value) ? "array" : "object",
    valueText: JSON.stringify(value),
  };
};

const sourceFields = (
  source: WorkflowValueSource,
): AgentLayerWorkflowValueSourceInput => {
  if (source.source === "literal")
    return { source: "literal", value: literalFields(source.value) };
  if (source.source === "input") return { source: "input", path: source.path };
  return { source: "step_output", path: source.path, stepKey: source.stepKey };
};

/** Локальные идентификаторы стабильны в открытой форме и никогда не входят в запрос API. */
export const getAgentLayerWorkflowFields = (
  source?: WorkflowDefinition,
): AgentLayerWorkflowInput => ({
  kind: "workflow_definition",
  key: source?.key ?? "",
  title: source?.title ?? "",
  description: source?.description ?? "",
  enabled: source?.enabled ?? true,
  entryStepKey: source?.entryStepKey ?? "",
  maxSteps: source ? String(source.maxSteps) : "64",
  steps: (source?.steps ?? []).map((step, index) => {
    const base = { id: `step-row-${index}`, key: step.key, keyInput: step.key };
    switch (step.type) {
      case "agent_turn":
      case "request_input":
        return {
          ...base,
          type: step.type,
          nextStepKey: step.nextStepKey,
          promptTemplateKey: step.promptTemplateKey,
        };
      case "check":
        return {
          ...base,
          type: step.type,
          nextStepKey: step.nextStepKey,
          checkBindingKey: step.checkBindingKey,
        };
      case "finish":
        return { ...base, type: step.type, outcome: step.outcome };
      case "branch":
        return {
          ...base,
          type: step.type,
          trueStepKey: step.trueStepKey,
          falseStepKey: step.falseStepKey,
          condition: {
            left: sourceFields(step.condition.left),
            operator: step.condition.operator,
            ...(step.condition.right === undefined
              ? {}
              : { right: sourceFields(step.condition.right) }),
          },
        };
      case "capability":
        return {
          ...base,
          type: step.type,
          nextStepKey: step.nextStepKey,
          capabilityBindingKey: step.capabilityBindingKey,
          input: Object.entries(step.input).map(([key, value], fieldIndex) => ({
            id: `input-row-${fieldIndex}`,
            key,
            value: sourceFields(value),
          })),
        };
    }
  }),
});
