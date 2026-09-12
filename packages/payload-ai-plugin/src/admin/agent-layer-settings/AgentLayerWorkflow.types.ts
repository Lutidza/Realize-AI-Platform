/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflow.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт локальные поля процесса, сохраняя промежуточный ввод чисел, значений и ключей.
 */

import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowValueSource,
} from "@realize/ai-contracts";

export type AgentLayerWorkflowLiteralInput =
  | { type: "string"; value: string }
  | { type: "number"; valueText: string }
  | { type: "boolean"; value: boolean }
  | { type: "null" }
  | { type: "array" | "object"; valueText: string };

export type AgentLayerWorkflowValueSourceInput =
  | Exclude<WorkflowValueSource, { source: "literal" }>
  | { source: "literal"; value: AgentLayerWorkflowLiteralInput };

/** Массив сохраняет незавершённые и повторяющиеся имена до явного исправления. */
export type AgentLayerWorkflowInputField = {
  id: string;
  key: string;
  value: AgentLayerWorkflowValueSourceInput;
};

type LocalStepIdentity = {
  id: string;
  /** Новый ключ применяется отдельным действием вместе с обновлением ссылок. */
  keyInput: string;
};

export type AgentLayerWorkflowStepInput = LocalStepIdentity &
  (
    | Exclude<WorkflowStep, { type: "capability" | "branch" }>
    | (Omit<Extract<WorkflowStep, { type: "capability" }>, "input"> & {
        input: readonly AgentLayerWorkflowInputField[];
      })
    | (Omit<Extract<WorkflowStep, { type: "branch" }>, "condition"> & {
        condition: {
          left: AgentLayerWorkflowValueSourceInput;
          operator: "equals" | "exists" | "not_equals";
          right?: AgentLayerWorkflowValueSourceInput;
        };
      })
  );

/** id и keyInput принадлежат форме; canonical DTO получает только подтверждённые ключи. */
export type AgentLayerWorkflowInput = Omit<
  WorkflowDefinition,
  "revision" | "maxSteps" | "steps"
> & {
  maxSteps: string;
  steps: readonly AgentLayerWorkflowStepInput[];
};
