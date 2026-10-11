/**
 * @file packages/payload-task-manager/src/taskManager.constants.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Объявляет закрытые коллекции и ограничение страниц постоянного Task Manager.
 * @see documentation/specifications/task-management-execution.md
 */
export const TASK_PROJECTS_SLUG = "realize-task-projects";
export const TASK_LISTS_SLUG = "realize-task-lists";
export const TASKS_SLUG = "realize-tasks";
export const TASK_EVENTS_SLUG = "realize-task-events";
export const TASK_OPERATIONS_SLUG = "realize-task-operations";
export const TASK_COLLECTION_SLUGS = [
  TASK_PROJECTS_SLUG,
  TASK_LISTS_SLUG,
  TASKS_SLUG,
  TASK_EVENTS_SLUG,
  TASK_OPERATIONS_SLUG,
] as const;
export const TASK_PAGE_SIZE = 50;
export const TASK_REQUEST_BYTES = 131072;
