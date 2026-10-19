/**
 * @file packages/payload-task-manager/src/TaskManagerOptions.types.ts
 * @version 1.2.0
 * @date 2026-10-19
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

export type TaskManagerPermission = "read" | "write" | "projects";

/** Admission не предоставляет Git, AI execution, release или deployment полномочия. */
export type TaskManagerOptions = {
  userCollection: CollectionSlug;
  /** Endpoint-local token binding; вызывается заново под mutation lock перед receipt/write. */
  authorizeRequest?: (args: {
    req: PayloadRequest;
    permission: TaskManagerPermission;
  }) => void | Promise<void>;
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
