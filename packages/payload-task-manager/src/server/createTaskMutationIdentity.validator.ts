/**
 * @file packages/payload-task-manager/src/server/createTaskMutationIdentity.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет UUID ключ команды и формирует прежнюю actor/operation-bound идентичность receipt.
 * @see documentation/specifications/task-management-execution.md
 */
import { createHash } from "node:crypto";
import { taskPublicIdSchema } from "../contracts/taskManager.schemas";
import { TaskManagerError } from "./TaskManager.error";
import type {
  TaskMutationIdentity,
  TaskMutationIdentityContext,
} from "./TaskMutation.types";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Предыдущие create/update hashes сохраняются; provider snapshot не участвует в request hash. */
export function createTaskMutationIdentity(
  context: TaskMutationIdentityContext,
): TaskMutationIdentity {
  const key = context.req.headers.get("idempotency-key");
  if (!key || !taskPublicIdSchema.safeParse(key).success)
    throw new TaskManagerError(
      "INVALID_REQUEST",
      "Требуется корректный Idempotency-Key.",
      422,
    );
  return {
    replayKey: hash([context.actorId, context.operation, key]),
    requestHash: hash([context.projectId, context.command]),
  };
}
