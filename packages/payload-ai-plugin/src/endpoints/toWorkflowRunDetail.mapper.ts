/**
 * @file packages/payload-ai-plugin/src/endpoints/toWorkflowRunDetail.mapper.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Строит allowlisted историю шагов из immutable checkpoint и актуальных owned операций.
 */

import type {
  JSONValue,
  WorkflowRegistryStep,
  WorkflowRegistryStepResult,
  WorkflowRunDetailDTO,
  WorkflowStep,
} from "@realize/ai-contracts";
import {
  getWorkflowDefinition,
  renderWorkflowInputPrompt,
} from "@realize/change-engine";
import { EndpointError } from "./http";
import { redactText } from "./redaction";
import { toRunDTO } from "./mappers";
import { toWorkflowRegistryItem } from "./toWorkflowRegistryItem.mapper";
import type { WorkflowRunDetailProjectionInput } from "./WorkflowRunProjection.types";

const invalid = (): never => {
  throw new EndpointError(
    "CONFLICT",
    "История процесса содержит неподтверждённый результат шага.",
    409,
  );
};
const objectOutput = (
  value: JSONValue,
): Readonly<Record<string, JSONValue>> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid();
  return value as Readonly<Record<string, JSONValue>>;
};
const textResult = (value: string): WorkflowRegistryStepResult => {
  const text = redactText(value);
  return {
    type: "text",
    text: text.slice(0, 8_000),
    truncated: text.length > 8_000,
  };
};
const validHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Сохраняет тип результата, но не выдаёт произвольные поля private outputs. */
export const toWorkflowRunDetail = (
  input: WorkflowRunDetailProjectionInput,
): WorkflowRunDetailDTO => {
  const first = input.segments[0];
  const latest = input.segments.at(-1);
  if (!first || !latest) return invalid();
  const { configuration, checkpoint } = latest;
  const definition = getWorkflowDefinition(
    configuration,
    checkpoint.workflowKey,
  );
  const byKey = new Map(definition.steps.map((step) => [step.key, step]));
  const completedPath = (
    outputs: Readonly<Record<string, JSONValue>>,
  ): string[] => {
    const path: string[] = [];
    let key = definition.entryStepKey;
    while (Object.hasOwn(outputs, key)) {
      const step = byKey.get(key);
      if (!step || path.includes(key)) return invalid();
      path.push(key);
      if (step.type === "finish") break;
      key =
        step.type === "branch"
          ? objectOutput(outputs[key]).matched === true
            ? step.trueStepKey
            : step.falseStepKey
          : step.nextStepKey;
    }
    return path;
  };
  const completedBy = new Map<string, string>();
  const segments = input.segments.map(({ run, checkpoint: saved }) => {
    const completedStepKeys = completedPath(saved.outputs).filter(
      (key) => !completedBy.has(key),
    );
    for (const key of completedStepKeys) completedBy.set(key, String(run.id));
    return { run: toRunDTO(run), completedStepKeys };
  });
  const pending = new Set<string>();
  const visit = (key: string): void => {
    if (pending.has(key)) return;
    const step = byKey.get(key);
    if (!step) return invalid();
    pending.add(key);
    if (step.type === "branch") {
      visit(step.trueStepKey);
      visit(step.falseStepKey);
    } else if (step.type !== "finish") visit(step.nextStepKey);
  };
  if (checkpoint.phase !== "completed" && checkpoint.phase !== "blocked")
    visit(checkpoint.stepKey);

  const resultFor = (
    step: WorkflowStep,
    value: JSONValue,
  ): WorkflowRegistryStepResult => {
    const output = objectOutput(value);
    switch (step.type) {
      case "agent_turn":
      case "request_input":
        return typeof output.text === "string"
          ? textResult(output.text)
          : invalid();
      case "branch":
        return typeof output.matched === "boolean"
          ? { type: "branch", matched: output.matched }
          : invalid();
      case "finish":
        return output.outcome === step.outcome
          ? { type: "finish", outcome: step.outcome }
          : invalid();
      case "capability": {
        if (
          typeof output.dataOperationID !== "string" ||
          !validHash(output.operationHash)
        )
          return invalid();
        const operation = input.dataOperations.get(output.dataOperationID);
        if (!operation || operation.operationHash !== output.operationHash)
          return invalid();
        return {
          type: "capability",
          dataOperationID: operation.id,
          operationHash: operation.operationHash,
          state: operation.state,
        };
      }
      case "check": {
        const binding = configuration.compiled.selectedArtifacts.find(
          ({ artifact }) =>
            artifact.kind === "check_binding" &&
            artifact.key === step.checkBindingKey,
        )?.artifact;
        if (
          binding?.kind !== "check_binding" ||
          output.checkID !== binding.checkID ||
          output.status !== "passed" ||
          typeof output.dataOperationID !== "string" ||
          !validHash(output.operationHash) ||
          !validHash(output.evidenceHash)
        )
          return invalid();
        const operation = input.dataOperations.get(output.dataOperationID);
        if (!operation || operation.operationHash !== output.operationHash)
          return invalid();
        return {
          type: "check",
          checkID: binding.checkID,
          status: "passed",
          evidenceHash: output.evidenceHash,
          dataOperationID: operation.id,
          operationHash: output.operationHash,
        };
      }
    }
  };
  const orderedKeys = [...completedPath(checkpoint.outputs), ...pending];
  if (!orderedKeys.includes(checkpoint.stepKey))
    orderedKeys.push(checkpoint.stepKey);
  for (const step of definition.steps)
    if (!orderedKeys.includes(step.key)) orderedKeys.push(step.key);
  const steps: WorkflowRegistryStep[] = orderedKeys.map((key) => {
    const step = byKey.get(key)!;
    const completed = completedBy.has(step.key);
    const current = !completed && checkpoint.stepKey === step.key;
    return {
      key: step.key,
      type: step.type,
      status: completed
        ? "completed"
        : current
          ? "current"
          : pending.has(step.key)
            ? "pending"
            : "skipped",
      ...(completed
        ? {
            segmentRunID: completedBy.get(step.key),
            result: resultFor(step, checkpoint.outputs[step.key]),
          }
        : current
          ? {
              segmentRunID: String(latest.run.id),
              ...(step.type === "request_input" &&
              checkpoint.phase === "awaiting_input"
                ? {
                    result: textResult(
                      renderWorkflowInputPrompt(configuration, checkpoint),
                    ),
                  }
                : {}),
            }
          : {}),
    };
  });
  return {
    item: toWorkflowRegistryItem({
      rootRunID: String(first.run.id),
      rootCreatedAt: first.run.createdAt ?? "",
      latestRun: latest.run,
      conversation: input.conversation,
      segmentCount: segments.length,
      enabled: input.enabled,
    }),
    segments,
    steps,
    dataOperations: [...input.dataOperations.values()],
    permissions: {
      canManageData: input.permissions.canManageData,
      canManageConfiguration: input.permissions.canManageConfiguration,
    },
  };
};
