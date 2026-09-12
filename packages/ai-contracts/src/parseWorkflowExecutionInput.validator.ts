/**
 * @file packages/ai-contracts/src/parseWorkflowExecutionInput.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет strict public команды запуска и продолжения workflow.
 */

import type {
  ContinueWorkflowInput,
  WorkflowStartInput,
} from "./WorkflowExecution.types";
import type { JSONValue } from "./workflows";
import {
  parseInteger,
  parseStableKey,
  parseString,
  requireExactKeys,
  strictObject,
} from "./aiConfigurationParsingSupport";
import {
  parseWorkflowJSONValue,
  requireWorkflowJSONSize,
} from "./parseWorkflowJSONValue.validator";
import { ContractValidationError } from "./validation";

/** Проверяет bounded JSON object без служебного поля request, назначаемого сервером. */
export const parseWorkflowStartInput = (value: unknown): WorkflowStartInput => {
  const input = strictObject(parseWorkflowJSONValue(value), "workflow");
  requireExactKeys(input, ["key", "input"], ["key"], "workflow");
  const fields =
    input.input === undefined
      ? undefined
      : (strictObject(input.input, "workflow.input") as Record<
          string,
          JSONValue
        >);
  if (fields && Object.hasOwn(fields, "request"))
    throw new ContractValidationError(
      "workflow.input.request назначает сервер.",
    );
  const result = {
    key: parseStableKey(input.key, "workflow.key"),
    ...(fields ? { input: fields } : {}),
  };
  requireWorkflowJSONSize(result, "workflow");
  return result;
};

/** Phase-specific обязательность content дополнительно проверяется по сохранённому checkpoint. */
export const parseContinueWorkflowInput = (
  value: unknown,
): ContinueWorkflowInput => {
  const input = strictObject(
    parseWorkflowJSONValue(value),
    "workflow continuation",
  );
  requireExactKeys(
    input,
    ["expectedVersion", "expectedStepKey", "content"],
    ["expectedVersion", "expectedStepKey"],
    "workflow continuation",
  );
  const content =
    input.content === undefined
      ? undefined
      : parseString(input.content, "content", 8_000, 1);
  if (content !== undefined && !content.trim())
    throw new ContractValidationError(
      "Введите ответ для продолжения процесса.",
    );
  return {
    expectedVersion: parseInteger(input.expectedVersion, "expectedVersion", 1),
    expectedStepKey: parseStableKey(input.expectedStepKey, "expectedStepKey"),
    ...(content === undefined ? {} : { content }),
  };
};
