/**
 * @file packages/change-engine/src/workflowPolicy.ts
 * @version 2026-09-01
 * @description Проверяет bounded declarative workflow graph до config release.
 * @docref Realize AI Commerce v1.0 — Интеграция системного и installation AI-layer
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */

import type {
  AIConfigValidationIssue,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowValueSource,
} from "@realize/ai-contracts";

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const successors = (step: WorkflowStep): readonly string[] => {
  switch (step.type) {
    case "branch":
      return [step.falseStepKey, step.trueStepKey];
    case "finish":
      return [];
    default:
      return [step.nextStepKey];
  }
};

const validateValueSource = (
  source: WorkflowValueSource,
  knownStepKeys: ReadonlySet<string>,
  path: string,
  issues: AIConfigValidationIssue[],
): void => {
  if (source.source === "literal") return;
  if (!source.path.trim() || source.path.length > 240) {
    issues.push({
      code: "workflow_value_path_invalid",
      message: "Workflow value path must contain between 1 and 240 characters.",
      path: `${path}.path`,
    });
  }
  if (source.source === "step_output" && !knownStepKeys.has(source.stepKey)) {
    issues.push({
      code: "workflow_output_step_missing",
      message: `Referenced output step does not exist: ${source.stepKey}.`,
      path: `${path}.stepKey`,
    });
  }
};

/** Возвращает все graph/schema issues одного WorkflowDefinition. */
export const validateWorkflowDefinition = (
  workflow: WorkflowDefinition,
  path = "workflow",
): readonly AIConfigValidationIssue[] => {
  const issues: AIConfigValidationIssue[] = [];
  const stepKeys = workflow.steps.map((step) => step.key);
  const knownStepKeys = new Set(stepKeys);

  if (!STABLE_KEY.test(workflow.key)) {
    issues.push({
      code: "workflow_key_invalid",
      message: "Workflow key is invalid.",
      path: `${path}.key`,
    });
  }
  if (
    !Number.isInteger(workflow.maxSteps) ||
    workflow.maxSteps < 1 ||
    workflow.maxSteps > 64
  ) {
    issues.push({
      code: "workflow_max_steps_invalid",
      message: "Workflow maxSteps must be an integer between 1 and 64.",
      path: `${path}.maxSteps`,
    });
  }
  if (workflow.steps.length < 1 || workflow.steps.length > 64) {
    issues.push({
      code: "workflow_steps_count_invalid",
      message: "Workflow must contain between 1 and 64 steps.",
      path: `${path}.steps`,
    });
  }
  if (workflow.steps.length > workflow.maxSteps) {
    issues.push({
      code: "workflow_steps_exceed_limit",
      message: "Workflow step count exceeds maxSteps.",
      path: `${path}.steps`,
    });
  }
  if (knownStepKeys.size !== stepKeys.length) {
    issues.push({
      code: "workflow_step_duplicate",
      message: "Workflow step keys must be unique.",
      path: `${path}.steps`,
    });
  }
  if (!knownStepKeys.has(workflow.entryStepKey)) {
    issues.push({
      code: "workflow_entry_missing",
      message: "Workflow entryStepKey must reference an existing step.",
      path: `${path}.entryStepKey`,
    });
  }

  workflow.steps.forEach((step, index) => {
    const stepPath = `${path}.steps[${index}]`;
    if (!STABLE_KEY.test(step.key)) {
      issues.push({
        code: "workflow_step_key_invalid",
        message: "Workflow step key is invalid.",
        path: `${stepPath}.key`,
      });
    }
    for (const target of successors(step)) {
      if (!knownStepKeys.has(target)) {
        issues.push({
          code: "workflow_transition_missing",
          message: `Workflow transition target does not exist: ${target}.`,
          path: stepPath,
        });
      }
    }
    if (step.type === "capability") {
      Object.entries(step.input).forEach(([key, source]) => {
        if (!STABLE_KEY.test(key)) {
          issues.push({
            code: "workflow_input_key_invalid",
            message: "Capability input key is invalid.",
            path: `${stepPath}.input`,
          });
        }
        validateValueSource(
          source,
          knownStepKeys,
          `${stepPath}.input.${key}`,
          issues,
        );
      });
    }
    if (step.type === "branch") {
      validateValueSource(
        step.condition.left,
        knownStepKeys,
        `${stepPath}.condition.left`,
        issues,
      );
      if (step.condition.operator === "exists" && step.condition.right) {
        issues.push({
          code: "workflow_exists_right_forbidden",
          message: "The exists condition must not define a right operand.",
          path: `${stepPath}.condition.right`,
        });
      }
      if (step.condition.operator !== "exists" && !step.condition.right) {
        issues.push({
          code: "workflow_condition_right_required",
          message: "Comparison condition requires a right operand.",
          path: `${stepPath}.condition.right`,
        });
      }
      if (step.condition.right) {
        validateValueSource(
          step.condition.right,
          knownStepKeys,
          `${stepPath}.condition.right`,
          issues,
        );
      }
    }
  });

  if (!knownStepKeys.has(workflow.entryStepKey)) return issues;
  const byKey = new Map(workflow.steps.map((step) => [step.key, step]));
  const reachable = new Set<string>();
  const active = new Set<string>();
  let hasReachableFinish = false;

  const visit = (key: string): void => {
    if (active.has(key)) {
      issues.push({
        code: "workflow_cycle_forbidden",
        message: `Workflow contains a cycle through step: ${key}.`,
        path: `${path}.steps`,
      });
      return;
    }
    if (reachable.has(key)) return;
    const step = byKey.get(key);
    if (!step) return;
    reachable.add(key);
    active.add(key);
    if (step.type === "finish") hasReachableFinish = true;
    for (const target of successors(step)) visit(target);
    active.delete(key);
  };
  visit(workflow.entryStepKey);

  if (!hasReachableFinish) {
    issues.push({
      code: "workflow_finish_missing",
      message: "Workflow must reach at least one finish step.",
      path: `${path}.steps`,
    });
  }
  for (const key of stepKeys) {
    if (!reachable.has(key)) {
      issues.push({
        code: "workflow_step_unreachable",
        message: `Workflow step is unreachable: ${key}.`,
        path: `${path}.steps`,
      });
    }
  }

  return issues;
};
