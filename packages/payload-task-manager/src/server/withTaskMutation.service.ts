/**
 * @file packages/payload-task-manager/src/server/withTaskMutation.service.ts
 * @version 1.0.2
 * @date 2026-10-12
 * @description Сохраняет task mutation и actor-bound durable replay receipt в одной транзакции.
 * @see documentation/specifications/task-management-execution.md
 */
import { TASK_OPERATIONS_SLUG } from "../taskManager.constants";
import { TaskStoreRepository } from "./TaskStore.repository";
import { withTaskTransaction } from "./withTaskTransaction.repository";
import type { TaskMutationContext } from "./TaskMutation.types";
import { createTaskMutationIdentity } from "./createTaskMutationIdentity.validator";
import { readTaskMutationReceipt } from "./readTaskMutationReceipt.service";

/** Проверка текущего ACL предшествует replay: receipt не восстанавливает отозванное право. */
export async function withTaskMutation<T>(
  context: TaskMutationContext<T>,
): Promise<T> {
  const identity = createTaskMutationIdentity(context);
  const repository = new TaskStoreRepository(context.req);
  return withTaskTransaction(
    context.req,
    context.actorId,
    context.projectId,
    async () => {
      await context.authorize();
      const previous = await readTaskMutationReceipt({
        req: context.req,
        identity,
        readReceipt: context.readReceipt,
      });
      if (previous.found) return previous.result;
      const { result, projectId } = await context.work();
      await repository.create(TASK_OPERATIONS_SLUG, {
        replayKey: identity.replayKey,
        requestHash: identity.requestHash,
        actorId: context.actorId,
        projectId,
        receipt: result,
      });
      return result;
    },
  );
}
