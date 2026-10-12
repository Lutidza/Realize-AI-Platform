/**
 * @file packages/payload-task-manager/src/contracts/TaskGitSync.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Определяет immutable Git sync, автора записи и CAS-команду без клиентских provider-фактов.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskGitObservationsDto } from "./TaskGitObservation.types";

/** expectedRevision защищает выбранные привязки; успешный sync не изменяет Task revision. */
export type TaskGitSyncInput = { expectedRevision: number };

/** observedAt описывает чтение провайдера, recordedAt — создание долговечного снимка. */
export type TaskGitSyncDto = TaskGitObservationsDto & {
  id: string;
  projectId: string;
  actorId: string;
  recordedAt: string;
};
