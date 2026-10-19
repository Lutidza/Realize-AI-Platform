/**
 * @file packages/payload-task-manager/src/server/TaskContainerManagement.types.ts
 * @version 1.1.0
 * @date 2026-10-19
 * @description Определяет зависимости управления проектами и списками с общей проверкой membership.
 * @see documentation/specifications/task-management-execution.md
 */
import type { PayloadRequest } from "payload";
import type {
  ResolvedTaskManagerOptions,
  TaskManagerPermission,
} from "../TaskManagerOptions.types";
import type { TaskActor, TaskProjectRecord } from "./TaskStorage.types";

export type TaskContainerManagementContext = {
  req: PayloadRequest;
  options: ResolvedTaskManagerOptions;
  authorize: (permission?: TaskManagerPermission) => Promise<TaskActor>;
  readProject: (
    projectId: string,
    actor: TaskActor,
  ) => Promise<TaskProjectRecord>;
};
