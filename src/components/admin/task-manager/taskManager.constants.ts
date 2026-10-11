/**
 * @file src/components/admin/task-manager/taskManager.constants.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Задаёт названия ограниченных состояний и приоритетов рабочих задач.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskEditableFields } from "@realize/payload-task-manager/contracts";

export const taskStatusLabels: Record<TaskEditableFields["status"], string> = {
  backlog: "Бэклог",
  in_progress: "В работе",
  review: "На проверке",
};
export const taskPriorityLabels: Record<
  TaskEditableFields["priority"],
  string
> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочный",
};
