/**
 * @file .ai/tools/worker-assignment/test/publication/foundationMembership.validator.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Проверяет членство владельца, автора и исполнителя в проекте сценария.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import type { FoundationProjectMembership } from "./FoundationTask.types";

export function assertFoundationMembership({
  owner,
  taskAuthor,
  assignee,
  members,
}: FoundationProjectMembership<string>) {
  if (!members.includes(owner))
    throw new Error("Владелец проекта должен входить в список участников.");
  if (!members.includes(taskAuthor))
    throw new Error("Автор задачи должен входить в список участников проекта.");
  if (assignee !== null && !members.includes(assignee))
    throw new Error("Исполнитель должен быть участником проекта.");
}
