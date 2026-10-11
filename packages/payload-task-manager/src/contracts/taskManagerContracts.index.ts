/**
 * @file packages/payload-task-manager/src/contracts/taskManagerContracts.index.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Публикует клиентские контракты без серверных зависимостей и импорта host-приложения.
 * @see documentation/specifications/task-management-execution.md
 */
export type * from "./TaskManager.types";
export {
  taskCreateSchema,
  taskUpdateSchema,
  taskProjectCreateSchema,
  taskProjectSchema,
  taskListSchema,
  taskSchema,
  taskEventSchema,
  taskGitBindingSchema,
} from "./taskManager.schemas";
