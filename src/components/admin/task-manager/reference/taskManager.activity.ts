/**
 * @file src/components/admin/task-manager/reference/taskManager.activity.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Добавляет упорядоченные события локальной задачи без внешних эффектов.
 * @see documentation/specifications/task-management-execution.md
 */
import type { PrototypeTask } from "./taskManager.types";

export function addTaskEvent(
  task: PrototypeTask,
  text: string,
  author = "Вы",
): void {
  task.activity.push({
    id: `${task.id}-event-${task.activity.length + 1}`,
    author,
    text,
    time: "Сейчас",
  });
}
