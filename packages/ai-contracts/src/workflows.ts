/**
 * @file packages/ai-contracts/src/workflows.ts
 * @version 2026-09-01
 * @description Задаёт декларативный и JSON-совместимый installation workflow contract.
 * @docref Realize AI Commerce v1.0 — Интеграция системного и installation AI-layer
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */

/** JSON-значение без runtime objects, функций и специальных чисел. */
export type JSONValue =
  | boolean
  | null
  | number
  | string
  | readonly JSONValue[]
  | { readonly [key: string]: JSONValue };

/** Источник одного значения для typed capability input или branch condition. */
export type WorkflowValueSource =
  | { path: string; source: "input" }
  | { path: string; source: "step_output"; stepKey: string }
  | { source: "literal"; value: JSONValue };

/** Ограниченное условие без произвольного JavaScript expression. */
export type WorkflowCondition = {
  left: WorkflowValueSource;
  operator: "equals" | "exists" | "not_equals";
  right?: WorkflowValueSource;
};

type WorkflowStepBase<TType extends string> = {
  key: string;
  type: TType;
};

/** Делегирует один bounded turn выбранному prompt template. */
export type AgentTurnWorkflowStep = WorkflowStepBase<"agent_turn"> & {
  nextStepKey: string;
  promptTemplateKey: string;
};

/** Приостанавливает workflow до нового явного ввода администратора. */
export type RequestInputWorkflowStep = WorkflowStepBase<"request_input"> & {
  nextStepKey: string;
  promptTemplateKey: string;
};

/** Передаёт typed intent Change Engine через installation capability binding. */
export type CapabilityWorkflowStep = WorkflowStepBase<"capability"> & {
  capabilityBindingKey: string;
  input: Readonly<Record<string, WorkflowValueSource>>;
  nextStepKey: string;
};

/** Выбирает server-owned check через installation check binding. */
export type CheckWorkflowStep = WorkflowStepBase<"check"> & {
  checkBindingKey: string;
  nextStepKey: string;
};

/** Выбирает одну из двух заранее объявленных ветвей. */
export type BranchWorkflowStep = WorkflowStepBase<"branch"> & {
  condition: WorkflowCondition;
  falseStepKey: string;
  trueStepKey: string;
};

/** Завершает workflow с machine-readable результатом. */
export type FinishWorkflowStep = WorkflowStepBase<"finish"> & {
  outcome: "blocked" | "completed";
};

/** Все разрешённые шаги первого декларативного workflow contract. */
export type WorkflowStep =
  | AgentTurnWorkflowStep
  | BranchWorkflowStep
  | CapabilityWorkflowStep
  | CheckWorkflowStep
  | FinishWorkflowStep
  | RequestInputWorkflowStep;

/** Versioned workflow artifact, публикуемый внутри AIConfigRelease. */
export type WorkflowDefinition = {
  description: string;
  enabled: boolean;
  entryStepKey: string;
  key: string;
  kind: "workflow_definition";
  maxSteps: number;
  revision: number;
  steps: readonly WorkflowStep[];
  title: string;
};
