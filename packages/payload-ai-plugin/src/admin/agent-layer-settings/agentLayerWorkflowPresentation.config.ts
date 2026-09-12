/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/agentLayerWorkflowPresentation.config.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт названия декларативных шагов, источников и типов значений рабочего процесса.
 */

import type { WorkflowStep } from "@realize/ai-contracts";
import type {
  AgentLayerWorkflowLiteralInput,
  AgentLayerWorkflowValueSourceInput,
} from "./AgentLayerWorkflow.types";

export const AGENT_LAYER_WORKFLOW_STEP_LABELS: Record<
  WorkflowStep["type"],
  string
> = {
  agent_turn: "Ход агента",
  request_input: "Запрос ввода",
  capability: "Возможность",
  check: "Проверка",
  branch: "Условие",
  finish: "Завершение",
};

export const AGENT_LAYER_WORKFLOW_SOURCE_LABELS: Record<
  AgentLayerWorkflowValueSourceInput["source"],
  string
> = {
  literal: "Заданное значение",
  input: "Входные данные процесса",
  step_output: "Результат шага",
};

export const AGENT_LAYER_WORKFLOW_LITERAL_LABELS: Record<
  AgentLayerWorkflowLiteralInput["type"],
  string
> = {
  string: "Текст",
  number: "Число",
  boolean: "Да / Нет",
  null: "Пустое значение",
  array: "Массив",
  object: "Объект",
};
