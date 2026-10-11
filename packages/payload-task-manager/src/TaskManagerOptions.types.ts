/**
 * @file packages/payload-task-manager/src/TaskManagerOptions.types.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Задаёт зависимости переносимого Task plugin от авторизации и пользователей host.
 * @see documentation/specifications/task-management-execution.md
 */
import type { CollectionSlug, PayloadRequest, Where } from "payload";

/** Admission не предоставляет Git, AI execution, release или deployment полномочия. */
export type TaskManagerOptions = {
  userCollection: CollectionSlug;
  canUseTaskManager: (args: {
    req: PayloadRequest;
  }) => boolean | Promise<boolean>;
  participantWhere: (args: { req: PayloadRequest }) => Where | Promise<Where>;
  participantLabelField?: string;
  apiRoute?: `/${string}`;
};
export type ResolvedTaskManagerOptions = TaskManagerOptions & {
  participantLabelField: string;
  apiRoute: `/${string}`;
};
