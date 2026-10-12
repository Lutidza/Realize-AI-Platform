/**
 * @file packages/payload-task-manager/src/TaskManagerOptions.types.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Задаёт переносимые зависимости Task plugin от admission, пользователей и read-only Git owner.
 * @see documentation/specifications/task-management-execution.md
 */
import type { CollectionSlug, PayloadRequest, Where } from "payload";
import type { TaskGitObservationProviderResult } from "./contracts/TaskGitObservation.types";
import type { TaskGitBinding } from "./contracts/TaskManager.types";

/** Host owner ограничивает всю операцию 10 секундами и не получает write-полномочия от Task admission. */
export type TaskGitBindingObserver = (args: {
  binding: TaskGitBinding;
  req: PayloadRequest;
}) => Promise<TaskGitObservationProviderResult>;

/** Admission не предоставляет Git, AI execution, release или deployment полномочия. */
export type TaskManagerOptions = {
  userCollection: CollectionSlug;
  canUseTaskManager: (args: {
    req: PayloadRequest;
  }) => boolean | Promise<boolean>;
  participantWhere: (args: { req: PayloadRequest }) => Where | Promise<Where>;
  participantLabelField?: string;
  apiRoute?: `/${string}`;
  observeGitBinding?: TaskGitBindingObserver;
};
export type ResolvedTaskManagerOptions = TaskManagerOptions & {
  participantLabelField: string;
  apiRoute: `/${string}`;
};
