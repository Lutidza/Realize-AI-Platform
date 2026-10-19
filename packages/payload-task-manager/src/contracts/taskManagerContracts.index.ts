/**
 * @file packages/payload-task-manager/src/contracts/taskManagerContracts.index.ts
 * @version 1.4.0
 * @date 2026-10-19
 * @description Публикует клиентские контракты без серверных зависимостей и импорта host-приложения.
 * @see documentation/specifications/task-management-execution.md
 */
export type * from "./TaskManager.types";
export type * from "./TaskGitObservation.types";
export type * from "./TaskGitSync.types";
export type {
  TaskWorkspaceCreateInput,
  TaskWorkspaceCreateResult,
} from "./TaskWorkspace.types";
export {
  taskGitSyncInputSchema,
  taskGitSyncSchema,
} from "./taskGitSync.schemas";
export {
  TASK_GIT_OBSERVATION_LIMIT,
  TASK_GIT_OBSERVATION_PULL_REQUEST_LIMIT,
  TASK_GIT_OBSERVATION_CI_LIMIT,
} from "./taskGitObservation.constants";
export {
  taskGitObservationProviderResultSchema,
  taskGitObservationItemSchema,
  taskGitObservationsSchema,
} from "./taskGitObservation.schemas";
export {
  taskCreateSchema,
  taskUpdateSchema,
  taskProjectCreateSchema,
  taskProjectUpdateSchema,
  taskListCreateSchema,
  taskListUpdateSchema,
  taskProjectSchema,
  taskListSchema,
  taskSchema,
  taskEventSchema,
  taskGitBindingSchema,
  taskWorkspaceCreateSchema,
  taskWorkspaceCreateResultSchema,
} from "./taskManager.schemas";
