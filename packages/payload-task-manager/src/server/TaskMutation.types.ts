/**
 * @file packages/payload-task-manager/src/server/TaskMutation.types.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Определяет контракт атомарной task mutation и её durable replay результата.
 * @see documentation/specifications/task-management-execution.md
 */
import type { PayloadRequest } from "payload";

/** Успешное изменение возвращает результат и проект для actor-bound receipt. */
export type TaskMutationResult<T> = {
  result: T;
  projectId: string;
};

/** Текущий доступ проверяется до replay; work и receipt фиксируются в одной транзакции. */
export type TaskMutationContext<T> = {
  req: PayloadRequest;
  actorId: string;
  projectId: string | null;
  operation: string;
  command: unknown;
  authorize: () => Promise<void>;
  readReceipt: (receipt: unknown) => T | Promise<T>;
  work: () => Promise<TaskMutationResult<T>>;
};

/** Hash не зависит от изменившегося состояния задачи: повтор возвращает исходный receipt. */
export type TaskMutationIdentity = { replayKey: string; requestHash: string };
export type TaskMutationIdentityContext = Pick<
  TaskMutationContext<unknown>,
  "req" | "actorId" | "projectId" | "operation" | "command"
>;
export type TaskMutationReceiptContext<T> = {
  req: PayloadRequest;
  identity: TaskMutationIdentity;
  readReceipt: TaskMutationContext<T>["readReceipt"];
};
export type TaskMutationReceiptResult<T> =
  { found: true; result: T } | { found: false };
