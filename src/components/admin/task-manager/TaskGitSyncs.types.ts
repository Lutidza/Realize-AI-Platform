/**
 * @file src/components/admin/task-manager/TaskGitSyncs.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отделяет историю Git-снимков и замороженный повтор синхронизации от task mutation.
 * @see documentation/specifications/task-management-execution.md
 */
import type { TaskGitSyncDto } from "@realize/payload-task-manager/contracts";

export type TaskGitSyncPendingCommand = {
  taskId: string;
  revision: number;
  key: string;
};
export type TaskGitSyncClientState = {
  taskId: string;
  revision: number;
  items: TaskGitSyncDto[];
  nextCursor: string | null;
  selectedId: string | null;
  historyError: string;
  syncError: string;
  loading: boolean;
  saving: boolean;
  retry: boolean;
};
