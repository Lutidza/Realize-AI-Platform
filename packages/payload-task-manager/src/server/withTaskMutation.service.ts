/**
 * @file packages/payload-task-manager/src/server/withTaskMutation.service.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Сохраняет task mutation и actor-bound durable replay receipt в одной транзакции.
 * @see documentation/specifications/task-management-execution.md
 */
import { createHash } from "node:crypto";
import type { PayloadRequest } from "payload";
import { taskPublicIdSchema } from "../contracts/taskManager.schemas";
import { TASK_OPERATIONS_SLUG } from "../taskManager.constants";
import { TaskManagerError } from "./TaskManager.error";
import { TaskStoreRepository } from "./TaskStore.repository";
import { withTaskTransaction } from "./withTaskTransaction.repository";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Проверка текущего ACL предшествует replay: receipt не восстанавливает отозванное право. */
export async function withTaskMutation<T>(context: {
  req: PayloadRequest;
  actorId: string;
  projectId: string | null;
  operation: string;
  command: unknown;
  authorize: () => Promise<void>;
  readReceipt: (receipt: unknown) => T | Promise<T>;
  work: () => Promise<{ result: T; projectId: string }>;
}): Promise<T> {
  const key = context.req.headers.get("idempotency-key");
  if (!key || !taskPublicIdSchema.safeParse(key).success)
    throw new TaskManagerError(
      "INVALID_REQUEST",
      "Требуется корректный Idempotency-Key.",
      422,
    );
  const replayKey = hash([context.actorId, context.operation, key]);
  const requestHash = hash([context.projectId, context.command]);
  const repository = new TaskStoreRepository(context.req);
  return withTaskTransaction(
    context.req,
    context.actorId,
    context.projectId,
    async () => {
      await context.authorize();
      const previous = await repository.replay(replayKey);
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new TaskManagerError(
            "CONFLICT",
            "Idempotency-Key уже использован для другого запроса.",
            409,
          );
        return context.readReceipt(previous.receipt);
      }
      const { result, projectId } = await context.work();
      await repository.create(TASK_OPERATIONS_SLUG, {
        replayKey,
        requestHash,
        actorId: context.actorId,
        projectId,
        receipt: result,
      });
      return result;
    },
  );
}
