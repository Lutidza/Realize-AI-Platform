/**
 * @file packages/payload-task-manager/src/server/mapTask.mapper.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Выдаёт явные DTO из проверенных storage snapshots и отделяет повреждение от ошибки клиента.
 * @see documentation/specifications/task-management-execution.md
 */
import type { z } from "zod";
import type {
  TaskDto,
  TaskEventDto,
  TaskListDto,
  TaskProjectDto,
} from "../contracts/TaskManager.types";
import {
  taskSchema,
  taskProjectSchema,
  taskListSchema,
  taskEventSchema,
} from "../contracts/taskManager.schemas";
import { TaskManagerError } from "./TaskManager.error";

function stored<T>(schema: z.ZodType<T>, record: unknown): T {
  const parsed = schema.safeParse(record);
  if (!parsed.success)
    throw new TaskManagerError(
      "STORAGE_UNAVAILABLE",
      "Сохранённая запись задачи недоступна.",
      503,
    );
  return parsed.data;
}

export function mapTaskProject(record: unknown): TaskProjectDto {
  const project = stored(taskProjectSchema, record);
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    ownerId: project.ownerId,
    memberIds: project.memberIds,
    revision: project.revision,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
export function mapTaskList(record: unknown): TaskListDto {
  const list = stored(taskListSchema, record);
  return {
    id: list.id,
    projectId: list.projectId,
    title: list.title,
    revision: list.revision,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
}
export function mapTask(record: unknown): TaskDto {
  const task = stored(taskSchema, record);
  return {
    id: task.id,
    key: task.key,
    projectId: task.projectId,
    listId: task.listId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId,
    gitBindings: task.gitBindings.map((binding) => ({
      repositoryId: binding.repositoryId,
      commitSha: binding.commitSha,
      purpose: binding.purpose,
      source: binding.source,
      verification: binding.verification,
    })),
    revision: task.revision,
    createdBy: task.createdBy,
    updatedBy: task.updatedBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
export function mapTaskEvent(record: unknown): TaskEventDto {
  const event = stored(taskEventSchema, record);
  return {
    id: event.id,
    taskId: event.taskId,
    actorId: event.actorId,
    kind: event.kind,
    revision: event.revision,
    occurredAt: event.occurredAt,
    summary: event.summary,
  };
}
