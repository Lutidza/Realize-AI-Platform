/**
 * @file packages/payload-task-manager/src/server/TaskGitSync.types.ts
 * @version 1.1.0
 * @date 2026-10-19
 * @description Задаёт зависимости Git sync от существующего task ACL и provider port без дублирования admission.
 * @see documentation/specifications/task-management-execution.md
 */
import type { PayloadRequest } from "payload";
import type { TaskDto } from "../contracts/TaskManager.types";
import type {
  ResolvedTaskManagerOptions,
  TaskManagerPermission,
} from "../TaskManagerOptions.types";
import type { TaskActor } from "./TaskStorage.types";

export type TaskGitSyncContext = {
  req: PayloadRequest;
  options: ResolvedTaskManagerOptions;
  authorize: (permission?: TaskManagerPermission) => Promise<TaskActor>;
  readTask: (taskId: string, actor: TaskActor) => Promise<TaskDto>;
};
