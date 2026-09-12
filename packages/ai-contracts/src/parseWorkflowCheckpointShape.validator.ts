/**
 * @file packages/ai-contracts/src/parseWorkflowCheckpointShape.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет форму закрытого checkpoint; связь с exact графом проверяет Change Engine.
 */

import type { WorkflowCheckpoint } from "./WorkflowExecution.types";
import type { JSONValue } from "./workflows";
import {
  parseEnum,
  parseInteger,
  parseSHA256,
  parseStableKey,
  parseString,
  requireExactKeys,
  strictObject,
} from "./aiConfigurationParsingSupport";
import { parseIdentifier } from "./validation";
import {
  parseWorkflowJSONValue,
  requireWorkflowJSONSize,
} from "./parseWorkflowJSONValue.validator";

/** Возвращает detached JSON snapshot; никакие browser-provided checkpoints не разрешаются этим parser. */
export const parseWorkflowCheckpointShape = (
  value: unknown,
): WorkflowCheckpoint => {
  const parsed = parseWorkflowJSONValue(value, "workflow checkpoint");
  requireWorkflowJSONSize(parsed, "workflow checkpoint");
  const input = strictObject(parsed, "workflow checkpoint");
  const required = [
    "schemaVersion",
    "workflowKey",
    "version",
    "stepKey",
    "completedSteps",
    "phase",
    "input",
    "outputs",
  ];
  requireExactKeys(
    input,
    [...required, "parentRunID", "rootRunID", "reason", "lastCapability"],
    required,
    "workflow checkpoint",
  );
  const output = strictObject(input.outputs, "outputs") as Record<
    string,
    JSONValue
  >;
  Object.keys(output).forEach((key) => parseStableKey(key, "output step key"));
  const receipt =
    input.lastCapability === undefined
      ? undefined
      : strictObject(input.lastCapability, "lastCapability");
  if (receipt)
    requireExactKeys(
      receipt,
      ["stepKey", "dataOperationID", "operationHash"],
      ["stepKey", "dataOperationID", "operationHash"],
      "lastCapability",
    );
  return {
    schemaVersion: parseEnum(input.schemaVersion, ["1.0"], "schemaVersion"),
    workflowKey: parseStableKey(input.workflowKey, "workflowKey"),
    version: parseInteger(input.version, "version", 1),
    stepKey: parseStableKey(input.stepKey, "stepKey"),
    completedSteps: parseInteger(input.completedSteps, "completedSteps", 0, 64),
    phase: parseEnum(
      input.phase,
      ["ready", "running", "awaiting_input", "completed", "blocked"],
      "phase",
    ),
    input: strictObject(input.input, "input") as Record<string, JSONValue>,
    outputs: output,
    ...(input.parentRunID === undefined
      ? {}
      : { parentRunID: parseIdentifier(input.parentRunID, "parentRunID") }),
    ...(input.rootRunID === undefined
      ? {}
      : { rootRunID: parseIdentifier(input.rootRunID, "rootRunID") }),
    ...(input.reason === undefined
      ? {}
      : { reason: parseString(input.reason, "reason", 1_000, 1) }),
    ...(receipt
      ? {
          lastCapability: {
            stepKey: parseStableKey(receipt.stepKey, "lastCapability.stepKey"),
            dataOperationID: parseIdentifier(
              receipt.dataOperationID,
              "lastCapability.dataOperationID",
            ),
            operationHash: parseSHA256(
              receipt.operationHash,
              "lastCapability.operationHash",
            ),
          },
        }
      : {}),
  };
};
