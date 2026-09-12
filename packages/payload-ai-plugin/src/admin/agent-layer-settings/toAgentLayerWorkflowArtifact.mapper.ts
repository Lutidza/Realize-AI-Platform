/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/toAgentLayerWorkflowArtifact.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Преобразует локальные поля процесса в strict canonical artifact без служебных идентификаторов формы.
 */

import {
  ContractValidationError,
  parseAIConfigArtifact,
} from "@realize/ai-contracts";
import type {
  WorkflowDefinition,
  WorkflowValueSource,
} from "@realize/ai-contracts";
import type {
  AgentLayerWorkflowInput,
  AgentLayerWorkflowInputField,
  AgentLayerWorkflowStepInput,
  AgentLayerWorkflowValueSourceInput,
} from "./AgentLayerWorkflow.types";
import { parseAgentLayerWorkflowJSONLiteral } from "./parseAgentLayerWorkflowJSONLiteral.util";

const requireKeys = (
  value: object,
  keys: readonly string[],
  label: string,
): void => {
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown)
    throw new ContractValidationError(
      `${label}: неподдерживаемое поле ${unknown}.`,
    );
};

const toSource = (
  input: AgentLayerWorkflowValueSourceInput,
  label: string,
): WorkflowValueSource => {
  if (input.source !== "literal") return { ...input };
  requireKeys(input, ["source", "value"], label);
  const { value } = input;
  switch (value.type) {
    case "null":
      requireKeys(value, ["type"], label);
      return { source: "literal", value: null };
    case "string":
    case "boolean":
      requireKeys(value, ["type", "value"], label);
      if (typeof value.value !== value.type)
        throw new ContractValidationError(
          `${label}: значение не соответствует выбранному типу.`,
        );
      return { source: "literal", value: value.value };
    case "number":
    case "array":
    case "object":
      requireKeys(value, ["type", "valueText"], label);
      return {
        source: "literal",
        value: parseAgentLayerWorkflowJSONLiteral(
          value.valueText,
          value.type,
          label,
        ),
      };
    default:
      throw new ContractValidationError(
        `${label}: выберите поддерживаемый тип значения.`,
      );
  }
};

/** Структурно корректные незавершённые графы остаются допустимыми черновиками. */
export const toAgentLayerWorkflowArtifact = (
  input: AgentLayerWorkflowInput,
): WorkflowDefinition => {
  if (
    typeof input.maxSteps !== "string" ||
    !/^\d+$/.test(input.maxSteps) ||
    Number(input.maxSteps) < 1 ||
    Number(input.maxSteps) > 64
  )
    throw new ContractValidationError(
      "Лимит шагов: укажите целое число от 1 до 64.",
    );
  if (!Array.isArray(input.steps) || input.steps.length > 64)
    throw new ContractValidationError(
      "Процесс может содержать не более 64 шагов.",
    );
  if (new Set(input.steps.map((step) => step.id)).size !== input.steps.length)
    throw new ContractValidationError(
      "Локальные идентификаторы шагов должны различаться.",
    );
  const formSteps: readonly AgentLayerWorkflowStepInput[] = input.steps;
  const steps = formSteps.map((step, index) => {
    const label = `Шаг ${index + 1} (${step.key})`;
    if (typeof step.id !== "string" || !step.id)
      throw new ContractValidationError(
        `${label}: отсутствует локальный идентификатор.`,
      );
    if (step.keyInput !== step.key)
      throw new ContractValidationError(
        `${label}: примените новый ключ или отмените переименование перед сохранением.`,
      );
    const { id: _id, keyInput: _keyInput, ...fields } = step;
    if (fields.type === "capability") {
      if (!Array.isArray(fields.input) || fields.input.length > 64)
        throw new ContractValidationError(
          `${label}: допускается не более 64 полей входных данных.`,
        );
      const keys = new Set<string>();
      const ids = new Set<string>();
      const inputFields: readonly AgentLayerWorkflowInputField[] = fields.input;
      return {
        ...fields,
        input: Object.fromEntries(
          inputFields.map((field, fieldIndex) => {
            requireKeys(
              field,
              ["id", "key", "value"],
              `${label}, поле ${fieldIndex + 1}`,
            );
            if (typeof field.key !== "string")
              throw new ContractValidationError(
                `${label}: имя входного поля должно быть строкой.`,
              );
            if (keys.has(field.key))
              throw new ContractValidationError(
                `${label}: имя входного поля «${field.key}» повторяется.`,
              );
            if (typeof field.id !== "string" || !field.id || ids.has(field.id))
              throw new ContractValidationError(
                `${label}: локальные идентификаторы входных полей должны различаться.`,
              );
            keys.add(field.key);
            ids.add(field.id);
            const fieldLabel = field.key
              ? `${label}, параметр «${field.key.slice(0, 128)}${field.key.length > 128 ? "…" : ""}»`
              : `${label}, поле ${fieldIndex + 1}`;
            return [field.key, toSource(field.value, fieldLabel)];
          }),
        ),
      };
    }
    if (fields.type === "branch")
      return {
        ...fields,
        condition: {
          ...fields.condition,
          left: toSource(fields.condition.left, `${label}, левое значение`),
          ...(fields.condition.right === undefined
            ? {}
            : {
                right: toSource(
                  fields.condition.right,
                  `${label}, правое значение`,
                ),
              }),
        },
      };
    return fields;
  });
  const artifact = parseAIConfigArtifact({
    ...input,
    maxSteps: Number(input.maxSteps),
    steps,
    revision: 1,
  });
  if (artifact.kind !== "workflow_definition")
    throw new ContractValidationError("Выберите рабочий процесс.");
  return artifact;
};
