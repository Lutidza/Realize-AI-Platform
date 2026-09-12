/**
 * @file packages/change-engine/src/toWorkflowRunSummary.mapper.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Выдаёт публичную сводку workflow по явному allowlist без значений и инструкций.
 */

import type {
  AIChatConfigurationSnapshot,
  WorkflowCheckpoint,
  WorkflowRunSummary,
} from "@realize/ai-contracts";
import {
  getWorkflowDefinition,
  getWorkflowStep,
  parseWorkflowCheckpoint,
} from "./workflowExecutionState.validator";

/** Mapper принимает только проверенный private checkpoint и возвращает новую безопасную проекцию. */
export const toWorkflowRunSummary = (
  snapshot: AIChatConfigurationSnapshot,
  value: WorkflowCheckpoint,
): WorkflowRunSummary => {
  const checkpoint = parseWorkflowCheckpoint(snapshot, value);
  const workflow = getWorkflowDefinition(snapshot, checkpoint.workflowKey);
  const step = getWorkflowStep(snapshot, checkpoint);
  return {
    key: workflow.key,
    title: workflow.title,
    revision: workflow.revision,
    stepKey: step.key,
    stepType: step.type,
    version: checkpoint.version,
    completedSteps: checkpoint.completedSteps,
    phase: checkpoint.phase,
    ...(checkpoint.reason === undefined ? {} : { reason: checkpoint.reason }),
    ...(checkpoint.parentRunID === undefined
      ? {}
      : { parentRunID: checkpoint.parentRunID }),
    ...(checkpoint.rootRunID === undefined
      ? {}
      : { rootRunID: checkpoint.rootRunID }),
  };
};
