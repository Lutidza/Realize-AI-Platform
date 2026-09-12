/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/workflowRunsPresentation.config.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт подписи серверных состояний и типов шагов реестра.
 */

import type {
  WorkflowRegistryStatus,
  WorkflowRegistryStep,
} from "@realize/ai-contracts";

export const workflowStatusLabels: Record<WorkflowRegistryStatus, string> = {
  queued: "В очереди",
  running: "Выполняется",
  ready: "Готов к продолжению",
  awaiting_input: "Ожидает ответа",
  completed: "Завершён",
  blocked: "Заблокирован",
  failed: "Ошибка",
  cancelled: "Остановлен",
};
export const workflowStepLabels: Record<WorkflowRegistryStep["type"], string> =
  {
    agent_turn: "Ответ агента",
    request_input: "Запрос ответа",
    branch: "Условие",
    capability: "Операция",
    check: "Проверка",
    finish: "Завершение",
  };
export const workflowStatusTone = (status: WorkflowRegistryStatus) =>
  status === "completed"
    ? ("positive" as const)
    : status === "failed" || status === "blocked"
      ? ("danger" as const)
      : ("neutral" as const);

/** Единая UTC-подпись совпадает с границами фильтра дат. */
export const workflowDate = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
