/**
 * @file .ai/tools/worker-assignment/test/publication/FoundationTask.types.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Задаёт поля проекта, списка и задачи для тестового сценария Foundation.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import type { TaskCreateInput } from "@realize/payload-task-manager/contracts";

export type FoundationTaskFields = Pick<
  TaskCreateInput,
  "listId" | "status" | "priority" | "gitBindings"
> & {
  createdAt: string;
  projectTitle: string;
  projectDescription: string;
  listTitle: string;
  taskTitle: string;
  taskDescription: string;
};

/** До регистрации участников используются ключи ролей, после регистрации — ID пользователей. */
export type FoundationProjectMembership<Actor extends string> = {
  readonly owner: Actor;
  readonly taskAuthor: Actor;
  readonly assignee: Actor | null;
  readonly members: readonly Actor[];
};
