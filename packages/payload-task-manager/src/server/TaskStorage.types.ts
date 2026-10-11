/**
 * @file packages/payload-task-manager/src/server/TaskStorage.types.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Определяет минимальный интерфейс storage JSON boundary без копирования host Payload types.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskProjectDto } from "../contracts/TaskManager.types";
import type { TASK_COLLECTION_SLUGS } from "../taskManager.constants";

export type TaskStorageSlug = (typeof TASK_COLLECTION_SLUGS)[number];
/** record проверяется schema после чтения; Payload id остаётся внутренним. */
export type TaskStorageRow = { id: string | number; record: unknown };
export type TaskOperationRow = { requestHash: string; receipt: unknown };
export type TaskActor = { id: string; payloadId: string | number };
export type TaskProjectRecord = {
  row: TaskStorageRow;
  project: TaskProjectDto;
};
