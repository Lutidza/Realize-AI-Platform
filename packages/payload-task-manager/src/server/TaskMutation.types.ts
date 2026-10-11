/**
 * @file packages/payload-task-manager/src/server/TaskMutation.types.ts
 * @version 1.0.0
 * @date 2026-10-11
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
