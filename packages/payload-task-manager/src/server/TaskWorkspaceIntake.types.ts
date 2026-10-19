/**
 * @file packages/payload-task-manager/src/server/TaskWorkspaceIntake.types.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Описывает внутренние зависимости intake и неизменяемую исходную идентичность задачи.
 * @see documentation/specifications/task-management-execution.md
 */
import type { PayloadRequest } from "payload";
import type { TaskCreateInput, TaskDto } from "../contracts/TaskManager.types";
import type { TaskActor } from "./TaskStorage.types";

export type TaskWorkspaceSource = {
  workspaceSourceId: string;
  workspaceCreateHash: string;
};

/** Приватные storage поля проверяются перед использованием и не входят в DTO. */
export type TaskWorkspaceSourceRow = {
  record: unknown;
  workspaceCreateHash: unknown;
};

export type TaskWorkspaceIntakeContext = {
  req: PayloadRequest;
  authorize: () => Promise<TaskActor>;
  authorizeProject: (projectId: string, actor: TaskActor) => Promise<unknown>;
  createTask: (
    input: TaskCreateInput,
    actor: TaskActor,
    source: TaskWorkspaceSource,
  ) => Promise<TaskDto>;
};
