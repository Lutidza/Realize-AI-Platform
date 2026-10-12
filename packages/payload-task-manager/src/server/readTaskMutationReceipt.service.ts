/**
 * @file packages/payload-task-manager/src/server/readTaskMutationReceipt.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Читает receipt с проверкой неизменного request hash для preflight и атомарной mutation.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  TaskMutationReceiptContext,
  TaskMutationReceiptResult,
} from "./TaskMutation.types";
import { TaskManagerError } from "./TaskManager.error";
import { TaskStoreRepository } from "./TaskStore.repository";

/** Caller проверяет актуальный ACL под locks до чтения; отсутствие receipt не создаёт запись. */
export async function readTaskMutationReceipt<T>(
  context: TaskMutationReceiptContext<T>,
): Promise<TaskMutationReceiptResult<T>> {
  const previous = await new TaskStoreRepository(context.req).replay(
    context.identity.replayKey,
  );
  if (!previous) return { found: false };
  if (previous.requestHash !== context.identity.requestHash)
    throw new TaskManagerError(
      "CONFLICT",
      "Idempotency-Key уже использован для другого запроса.",
      409,
    );
  return { found: true, result: await context.readReceipt(previous.receipt) };
}
