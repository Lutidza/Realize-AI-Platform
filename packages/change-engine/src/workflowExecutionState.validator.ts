/**
 * @file packages/change-engine/src/workflowExecutionState.validator.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Связывает checkpoint с exact графом и подтверждённым порядком выполненных шагов.
 */

import {
  parseWorkflowCheckpointShape,
  parseIdentifier,
  type AIChatConfigurationSnapshot,
  type JSONValue,
  type WorkflowCapabilityReceipt,
  type WorkflowCheckpoint,
  type WorkflowDefinition,
  type WorkflowStep,
} from "@realize/ai-contracts";
import { AIConfigurationPolicyError } from "./aiConfigurationError";
import { canonicalizeJSON } from "./canonicalJson";
import { parseAIChatConfigurationSnapshot } from "./parseAIChatConfigurationSnapshot.validator";
import { evaluateWorkflowCondition } from "./workflowValueResolution.service";

/** Процесс выбирается только из профиля проверенного immutable snapshot. */
export const getWorkflowDefinition = (
  snapshot: AIChatConfigurationSnapshot,
  key: string,
): WorkflowDefinition => {
  const { compiled } = parseAIChatConfigurationSnapshot(snapshot);
  const workflow = compiled.selectedArtifacts.find(
    ({ artifact }) =>
      artifact.kind === "workflow_definition" && artifact.key === key,
  )?.artifact;
  if (
    !compiled.profile.workflowKeys.includes(key) ||
    workflow?.kind !== "workflow_definition" ||
    !workflow.enabled
  )
    throw new AIConfigurationPolicyError(
      "Процесс отсутствует в выбранном профиле.",
    );
  return workflow;
};

const objectOutput = (output: JSONValue): Record<string, JSONValue> => {
  if (!output || typeof output !== "object" || Array.isArray(output))
    throw new AIConfigurationPolicyError(
      "Результат шага имеет неверную форму.",
    );
  return output as Record<string, JSONValue>;
};

/** Проверяет phase, счётчик и непрерывный путь; наличие hash/receipt само по себе не выдаёт authority. */
export const parseWorkflowCheckpoint = (
  snapshot: AIChatConfigurationSnapshot,
  value: unknown,
): WorkflowCheckpoint => {
  const checkpoint = parseWorkflowCheckpointShape(value);
  const workflow = getWorkflowDefinition(snapshot, checkpoint.workflowKey);
  const steps = new Map(workflow.steps.map((step) => [step.key, step]));
  if (
    typeof checkpoint.input.request !== "string" ||
    checkpoint.input.request.length > 8_000
  )
    throw new AIConfigurationPolicyError(
      "Checkpoint не содержит исходный запрос.",
    );
  if (
    checkpoint.completedSteps > workflow.maxSteps ||
    checkpoint.version < checkpoint.completedSteps + 1
  )
    throw new AIConfigurationPolicyError(
      "Checkpoint превышает лимит шагов или имеет неверную версию.",
    );
  const consumed: Record<string, JSONValue> = {};
  let key = workflow.entryStepKey;
  let terminal: Extract<WorkflowStep, { type: "finish" }> | undefined;
  let lastCapability: WorkflowCapabilityReceipt | undefined;
  while (Object.hasOwn(checkpoint.outputs, key)) {
    const step = steps.get(key);
    if (!step || Object.hasOwn(consumed, key))
      throw new AIConfigurationPolicyError(
        "Checkpoint содержит неверный путь выполнения.",
      );
    const output = objectOutput(checkpoint.outputs[key]);
    const previous: WorkflowCheckpoint = { ...checkpoint, outputs: consumed };
    if (step.type === "branch") {
      const matched = evaluateWorkflowCondition(step.condition, previous);
      if (canonicalizeJSON(output) !== canonicalizeJSON({ matched }))
        throw new AIConfigurationPolicyError(
          "Результат ветвления не соответствует данным.",
        );
      key = matched ? step.trueStepKey : step.falseStepKey;
    } else if (step.type === "finish") {
      if (
        canonicalizeJSON(output) !== canonicalizeJSON({ outcome: step.outcome })
      )
        throw new AIConfigurationPolicyError(
          "Результат finish не соответствует графу.",
        );
      terminal = step;
    } else {
      if (
        (step.type === "agent_turn" || step.type === "request_input") &&
        (typeof output.text !== "string" || Object.keys(output).length !== 1)
      )
        throw new AIConfigurationPolicyError(
          "Шаг диалога должен содержать только текст ответа.",
        );
      if (step.type === "capability") {
        if (
          typeof output.dataOperationID !== "string" ||
          typeof output.operationHash !== "string" ||
          !/^[a-f0-9]{64}$/.test(output.operationHash)
        )
          throw new AIConfigurationPolicyError(
            "Capability не содержит ссылку на DataOperation.",
          );
        parseIdentifier(output.dataOperationID, "DataOperation output ID");
        lastCapability = {
          stepKey: step.key,
          dataOperationID: output.dataOperationID,
          operationHash: output.operationHash,
        };
      }
      key = step.nextStepKey;
    }
    Object.defineProperty(consumed, step.key, {
      value: output,
      enumerable: true,
      configurable: true,
    });
    if (terminal) break;
  }
  const count = Object.keys(consumed).length;
  const step = steps.get(checkpoint.stepKey);
  if (
    !step ||
    checkpoint.stepKey !== key ||
    count !== checkpoint.completedSteps ||
    count !== Object.keys(checkpoint.outputs).length
  )
    throw new AIConfigurationPolicyError(
      "Checkpoint содержит пропущенные или посторонние результаты шагов.",
    );
  if (
    canonicalizeJSON(lastCapability ?? null) !==
    canonicalizeJSON(checkpoint.lastCapability ?? null)
  )
    throw new AIConfigurationPolicyError(
      "Capability receipt не соответствует последнему выполненному шагу.",
    );
  if (checkpoint.phase === "completed" && terminal?.outcome !== "completed")
    throw new AIConfigurationPolicyError(
      "Завершение workflow не подтверждено finish шагом.",
    );
  if (
    terminal &&
    checkpoint.phase !==
      (terminal.outcome === "completed" ? "completed" : "blocked")
  )
    throw new AIConfigurationPolicyError(
      "Терминальный checkpoint имеет неверное состояние.",
    );
  if (checkpoint.phase === "running" && step.type !== "agent_turn")
    throw new AIConfigurationPolicyError(
      "Только agent_turn может ожидать runtime.",
    );
  if (checkpoint.phase === "awaiting_input" && step.type !== "request_input")
    throw new AIConfigurationPolicyError(
      "Ввод ожидается только на request_input.",
    );
  if (
    checkpoint.phase !== "blocked" &&
    checkpoint.phase !== "completed" &&
    count >= workflow.maxSteps
  )
    throw new AIConfigurationPolicyError(
      "Достигнут лимит выполнения workflow.",
    );
  return checkpoint;
};

/** Возвращает текущий шаг только после проверки checkpoint и exact snapshot. */
export const getWorkflowStep = (
  snapshot: AIChatConfigurationSnapshot,
  checkpoint: WorkflowCheckpoint,
): WorkflowStep => {
  const parsed = parseWorkflowCheckpoint(snapshot, checkpoint);
  return getWorkflowDefinition(snapshot, parsed.workflowKey).steps.find(
    (step) => step.key === parsed.stepKey,
  )!;
};
