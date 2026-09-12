/**
 * @file packages/change-engine/src/workflowExecutionTransitions.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Выполняет immutable переходы bounded workflow без вызовов моделей и побочных эффектов.
 */

import {
  parseContinueWorkflowInput,
  parseWorkflowStartInput,
  type AIChatConfigurationSnapshot,
  type JSONValue,
  type WorkflowCapabilityReceipt,
  type WorkflowCheckpoint,
} from "@realize/ai-contracts";
import { AIConfigurationPolicyError } from "./aiConfigurationError";
import {
  getWorkflowDefinition,
  getWorkflowStep,
  parseWorkflowCheckpoint,
} from "./workflowExecutionState.validator";
import { evaluateWorkflowCondition } from "./workflowValueResolution.service";

const requireReady = (checkpoint: WorkflowCheckpoint): void => {
  if (checkpoint.phase !== "ready")
    throw new AIConfigurationPolicyError("Шаг workflow не готов к выполнению.");
};

/** request нельзя переопределить пользовательским JSON; начальное состояние не исполняет граф. */
export const initializeWorkflow = (
  snapshot: AIChatConfigurationSnapshot,
  key: string,
  request: string,
  input?: Record<string, JSONValue>,
): WorkflowCheckpoint => {
  const selected = parseWorkflowStartInput({
    key,
    ...(input === undefined ? {} : { input }),
  });
  const workflow = getWorkflowDefinition(snapshot, selected.key);
  return parseWorkflowCheckpoint(snapshot, {
    schemaVersion: "1.0",
    workflowKey: key,
    version: 1,
    stepKey: workflow.entryStepKey,
    completedSteps: 0,
    phase: "ready",
    input: { ...selected.input, request },
    outputs: {},
  });
};

/** Успешный внешний шаг записывает только предоставленный владельцем typed result и переходит дальше. */
export const completeWorkflowStep = (
  snapshot: AIChatConfigurationSnapshot,
  value: WorkflowCheckpoint,
  output: JSONValue,
  lastCapability?: WorkflowCapabilityReceipt,
): WorkflowCheckpoint => {
  const checkpoint = parseWorkflowCheckpoint(snapshot, value);
  const step = getWorkflowStep(snapshot, checkpoint);
  if (
    (step.type !== "agent_turn" &&
      step.type !== "capability" &&
      step.type !== "check") ||
    (step.type === "agent_turn"
      ? checkpoint.phase !== "running"
      : checkpoint.phase !== "ready")
  )
    throw new AIConfigurationPolicyError(
      "Этот шаг нельзя завершить внешним результатом.",
    );
  if (
    (step.type === "capability" && lastCapability?.stepKey !== step.key) ||
    (step.type !== "capability" && lastCapability)
  )
    throw new AIConfigurationPolicyError(
      "Capability receipt не соответствует завершаемому шагу.",
    );
  return parseWorkflowCheckpoint(snapshot, {
    ...checkpoint,
    outputs: { ...checkpoint.outputs, [step.key]: output },
    completedSteps: checkpoint.completedSteps + 1,
    version: checkpoint.version + 1,
    phase: "ready",
    stepKey: step.nextStepKey,
    ...(lastCapability ? { lastCapability } : {}),
  });
};

/** Выбирает единственную следующую ветвь и сохраняет детерминированный результат сравнения. */
export const advanceWorkflowBranch = (
  snapshot: AIChatConfigurationSnapshot,
  value: WorkflowCheckpoint,
): WorkflowCheckpoint => {
  const checkpoint = parseWorkflowCheckpoint(snapshot, value);
  requireReady(checkpoint);
  const step = getWorkflowStep(snapshot, checkpoint);
  if (step.type !== "branch")
    throw new AIConfigurationPolicyError("Текущий шаг не является условием.");
  const matched = evaluateWorkflowCondition(step.condition, checkpoint);
  return parseWorkflowCheckpoint(snapshot, {
    ...checkpoint,
    outputs: { ...checkpoint.outputs, [step.key]: { matched } },
    completedSteps: checkpoint.completedSteps + 1,
    version: checkpoint.version + 1,
    stepKey: matched ? step.trueStepKey : step.falseStepKey,
  });
};

/** Отмечает один bounded provider turn; выполнение и authority остаются у server adapter. */
export const startWorkflowAgentTurn = (
  snapshot: AIChatConfigurationSnapshot,
  value: WorkflowCheckpoint,
): WorkflowCheckpoint => {
  const checkpoint = parseWorkflowCheckpoint(snapshot, value);
  requireReady(checkpoint);
  if (getWorkflowStep(snapshot, checkpoint).type !== "agent_turn")
    throw new AIConfigurationPolicyError(
      "Текущий шаг не является обращением к агенту.",
    );
  return parseWorkflowCheckpoint(snapshot, {
    ...checkpoint,
    phase: "running",
    version: checkpoint.version + 1,
  });
};

/** Остановка на вопросе не засчитывает шаг до получения явного ответа. */
export const awaitWorkflowInput = (
  snapshot: AIChatConfigurationSnapshot,
  value: WorkflowCheckpoint,
): WorkflowCheckpoint => {
  const checkpoint = parseWorkflowCheckpoint(snapshot, value);
  requireReady(checkpoint);
  if (getWorkflowStep(snapshot, checkpoint).type !== "request_input")
    throw new AIConfigurationPolicyError("Текущий шаг не запрашивает ввод.");
  return parseWorkflowCheckpoint(snapshot, {
    ...checkpoint,
    phase: "awaiting_input",
    version: checkpoint.version + 1,
  });
};

/** Ответ становится typed output вопроса, а не инструкциями или подменой начального input. */
export const resumeWorkflowInput = (
  snapshot: AIChatConfigurationSnapshot,
  value: WorkflowCheckpoint,
  content: string,
): WorkflowCheckpoint => {
  const checkpoint = parseWorkflowCheckpoint(snapshot, value);
  const step = getWorkflowStep(snapshot, checkpoint);
  if (checkpoint.phase !== "awaiting_input" || step.type !== "request_input")
    throw new AIConfigurationPolicyError(
      "Workflow не ожидает пользовательский ввод.",
    );
  const parsed = parseContinueWorkflowInput({
    expectedVersion: checkpoint.version,
    expectedStepKey: checkpoint.stepKey,
    content,
  });
  return parseWorkflowCheckpoint(snapshot, {
    ...checkpoint,
    outputs: { ...checkpoint.outputs, [step.key]: { text: parsed.content! } },
    completedSteps: checkpoint.completedSteps + 1,
    version: checkpoint.version + 1,
    phase: "ready",
    stepKey: step.nextStepKey,
  });
};

/** Finish завершает сам workflow, в отличие от завершения отдельного AIRun сегмента. */
export const finishWorkflow = (
  snapshot: AIChatConfigurationSnapshot,
  value: WorkflowCheckpoint,
): WorkflowCheckpoint => {
  const checkpoint = parseWorkflowCheckpoint(snapshot, value);
  requireReady(checkpoint);
  const step = getWorkflowStep(snapshot, checkpoint);
  if (step.type !== "finish")
    throw new AIConfigurationPolicyError("Текущий шаг не завершает workflow.");
  return parseWorkflowCheckpoint(snapshot, {
    ...checkpoint,
    outputs: { ...checkpoint.outputs, [step.key]: { outcome: step.outcome } },
    completedSteps: checkpoint.completedSteps + 1,
    version: checkpoint.version + 1,
    phase: step.outcome,
    ...(step.outcome === "blocked"
      ? { reason: "Процесс завершён с результатом «Остановлен»." }
      : {}),
  });
};

/** Сохраняет безопасную причину остановки без выдуманного результата незавершённого шага. */
export const blockWorkflow = (
  snapshot: AIChatConfigurationSnapshot,
  value: WorkflowCheckpoint,
  reason: string,
): WorkflowCheckpoint => {
  const checkpoint = parseWorkflowCheckpoint(snapshot, value);
  if (checkpoint.phase === "completed" || checkpoint.phase === "blocked")
    throw new AIConfigurationPolicyError("Workflow уже завершён.");
  return parseWorkflowCheckpoint(snapshot, {
    ...checkpoint,
    phase: "blocked",
    reason,
    version: checkpoint.version + 1,
  });
};
