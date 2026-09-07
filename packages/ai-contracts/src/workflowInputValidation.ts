/**
 * @file packages/ai-contracts/src/workflowInputValidation.ts
 * @version 2026-09-01
 * @description Строго разбирает declarative workflow без executable expressions.
 * @docref Realize AI Commerce v1.0 — Интеграция системного и installation AI-layer
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */

import type {
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowValueSource,
} from "./workflows";
import {
  parseBoolean,
  parseEnum,
  parseInteger,
  parseJSONValue,
  parseStableKey,
  parseString,
  requireExactKeys,
  strictObject,
} from "./aiConfigurationParsingSupport";
import { ContractValidationError } from "./validation";

const parseValueSource = (
  value: unknown,
  name: string,
): WorkflowValueSource => {
  const input = strictObject(value, name);
  const source = parseEnum(
    input.source,
    ["input", "literal", "step_output"] as const,
    `${name}.source`,
  );
  if (source === "literal") {
    requireExactKeys(input, ["source", "value"], ["source", "value"], name);
    return { source, value: parseJSONValue(input.value, `${name}.value`) };
  }
  if (source === "input") {
    requireExactKeys(input, ["path", "source"], ["path", "source"], name);
    return {
      path: parseString(input.path, `${name}.path`, 240, 1),
      source,
    };
  }
  requireExactKeys(
    input,
    ["path", "source", "stepKey"],
    ["path", "source", "stepKey"],
    name,
  );
  return {
    path: parseString(input.path, `${name}.path`, 240, 1),
    source,
    stepKey: parseStableKey(input.stepKey, `${name}.stepKey`),
  };
};

const parseCondition = (value: unknown, name: string): WorkflowCondition => {
  const input = strictObject(value, name);
  requireExactKeys(
    input,
    ["left", "operator", "right"],
    ["left", "operator"],
    name,
  );
  const right =
    input.right === undefined
      ? undefined
      : parseValueSource(input.right, `${name}.right`);
  return {
    left: parseValueSource(input.left, `${name}.left`),
    operator: parseEnum(
      input.operator,
      ["equals", "exists", "not_equals"] as const,
      `${name}.operator`,
    ),
    ...(right ? { right } : {}),
  };
};

const parseCapabilityInput = (
  value: unknown,
  name: string,
): Readonly<Record<string, WorkflowValueSource>> => {
  const input = strictObject(value, name);
  const entries = Object.entries(input);
  if (entries.length > 64) {
    throw new ContractValidationError(`${name} contains too many fields.`);
  }
  return Object.fromEntries(
    entries.map(([key, source]) => [
      parseStableKey(key, `${name} field`),
      parseValueSource(source, `${name}.${key}`),
    ]),
  );
};

const parseStep = (value: unknown, name: string): WorkflowStep => {
  const input = strictObject(value, name);
  const type = parseEnum(
    input.type,
    [
      "agent_turn",
      "branch",
      "capability",
      "check",
      "finish",
      "request_input",
    ] as const,
    `${name}.type`,
  );
  const key = parseStableKey(input.key, `${name}.key`);
  if (type === "finish") {
    requireExactKeys(
      input,
      ["key", "outcome", "type"],
      ["key", "outcome", "type"],
      name,
    );
    return {
      key,
      outcome: parseEnum(
        input.outcome,
        ["blocked", "completed"] as const,
        `${name}.outcome`,
      ),
      type,
    };
  }
  if (type === "branch") {
    requireExactKeys(
      input,
      ["condition", "falseStepKey", "key", "trueStepKey", "type"],
      ["condition", "falseStepKey", "key", "trueStepKey", "type"],
      name,
    );
    return {
      condition: parseCondition(input.condition, `${name}.condition`),
      falseStepKey: parseStableKey(input.falseStepKey, `${name}.falseStepKey`),
      key,
      trueStepKey: parseStableKey(input.trueStepKey, `${name}.trueStepKey`),
      type,
    };
  }
  const nextStepKey = parseStableKey(input.nextStepKey, `${name}.nextStepKey`);
  if (type === "capability") {
    requireExactKeys(
      input,
      ["capabilityBindingKey", "input", "key", "nextStepKey", "type"],
      ["capabilityBindingKey", "input", "key", "nextStepKey", "type"],
      name,
    );
    return {
      capabilityBindingKey: parseStableKey(
        input.capabilityBindingKey,
        `${name}.capabilityBindingKey`,
      ),
      input: parseCapabilityInput(input.input, `${name}.input`),
      key,
      nextStepKey,
      type,
    };
  }
  if (type === "check") {
    requireExactKeys(
      input,
      ["checkBindingKey", "key", "nextStepKey", "type"],
      ["checkBindingKey", "key", "nextStepKey", "type"],
      name,
    );
    return {
      checkBindingKey: parseStableKey(
        input.checkBindingKey,
        `${name}.checkBindingKey`,
      ),
      key,
      nextStepKey,
      type,
    };
  }
  requireExactKeys(
    input,
    ["key", "nextStepKey", "promptTemplateKey", "type"],
    ["key", "nextStepKey", "promptTemplateKey", "type"],
    name,
  );
  return {
    key,
    nextStepKey,
    promptTemplateKey: parseStableKey(
      input.promptTemplateKey,
      `${name}.promptTemplateKey`,
    ),
    type,
  };
};

/** Parses one complete workflow artifact with exact fields and bounded graph size. */
export const parseWorkflowDefinition = (
  value: unknown,
  name: string,
): WorkflowDefinition => {
  const input = strictObject(value, name);
  requireExactKeys(
    input,
    [
      "description",
      "enabled",
      "entryStepKey",
      "key",
      "kind",
      "maxSteps",
      "revision",
      "steps",
      "title",
    ],
    [
      "description",
      "enabled",
      "entryStepKey",
      "key",
      "kind",
      "maxSteps",
      "revision",
      "steps",
      "title",
    ],
    name,
  );
  if (!Array.isArray(input.steps) || input.steps.length > 64) {
    throw new ContractValidationError(
      `${name}.steps must contain at most 64 items.`,
    );
  }
  return {
    description: parseString(input.description, `${name}.description`, 2_000),
    enabled: parseBoolean(input.enabled, `${name}.enabled`),
    entryStepKey: parseStableKey(input.entryStepKey, `${name}.entryStepKey`),
    key: parseStableKey(input.key, `${name}.key`),
    kind: parseEnum(
      input.kind,
      ["workflow_definition"] as const,
      `${name}.kind`,
    ),
    maxSteps: parseInteger(input.maxSteps, `${name}.maxSteps`, 1, 64),
    revision: parseInteger(input.revision, `${name}.revision`, 1),
    steps: input.steps.map((step, index) =>
      parseStep(step, `${name}.steps[${index}]`),
    ),
    title: parseString(input.title, `${name}.title`, 120),
  };
};
