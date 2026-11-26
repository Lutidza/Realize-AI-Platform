/**
 * @file packages/payload-task-manager/src/contracts/TaskManager.types.ts
 * @version 1.1.1
 * @date 2026-11-26
 * @description Определяет публичные задачи, проекты, списки и историю первого постоянного среза.
 * @see documentation/specifications/task-management-execution.md
 */

/** Ручная привязка коммита не подтверждает его существование, проверки или публикацию. */
export type TaskGitBinding = {
  repositoryId: string;
  commitSha: string;
  purpose: "platform-core" | "customer-project";
  source: "manual";
  verification: "unverified";
};

/** Публичное состояние проекта; membership проверяется заново при каждой операции. */
export type TaskProjectDto = {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  memberIds: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskListDto = {
  id: string;
  projectId: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

/** Проект и список задаются при создании задачи. При обновлении Task Manager сохраняет прежние projectId и listId. */
export type TaskEditableFields = {
  title: string;
  description: string;
  status: "backlog" | "in_progress" | "review";
  priority: "low" | "normal" | "high" | "urgent";
  assigneeId: string | null;
  gitBindings: TaskGitBinding[];
};

/** revision относится к конкурентному редактированию задачи, не к версии платформы. */
export type TaskDto = TaskEditableFields & {
  id: string;
  key: string;
  projectId: string;
  listId: string;
  revision: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskProjectCreateInput = {
  title: string;
  description: string;
  memberIds: string[];
};
/** Полная замена редактируемых полей; сервер сохраняет владельца в составе участников. */
export type TaskProjectUpdateInput = TaskProjectCreateInput & {
  expectedRevision: number;
};
export type TaskListCreateInput = {
  projectId: string;
  title: string;
};
/** Принадлежность списка проекту неизменна. */
export type TaskListUpdateInput = {
  title: string;
  expectedRevision: number;
};
export type TaskCreateInput = TaskEditableFields & {
  projectId: string;
  listId: string;
};
export type TaskUpdateInput = TaskEditableFields & {
  expectedRevision: number;
};

/** История содержит фактического автора и номер результата; закрытые документы не выдаются. */
export type TaskEventDto = {
  id: string;
  taskId: string;
  actorId: string;
  kind: "created" | "updated";
  revision: number;
  occurredAt: string;
  summary: string;
};
export type TaskParticipantDto = { id: string; name: string };
export type TaskPageDto<T> = { items: T[]; nextCursor: string | null };
export type TaskApiResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };
