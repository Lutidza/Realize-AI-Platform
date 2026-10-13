/**
 * @file packages/payload-task-manager/src/contracts/workspace/workspaceTransition.validator.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет allowlist локального перехода без команд управления чужим runtime.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import { workspaceReasonSchema } from "./workspaceScalarSchemas.validator";
import { workspaceTaskSchema } from "./workspaceTask.validator";

/**
 * execution — наблюдаемая проекция; pause/cancel/dispatch выполняет только исходный runtime owner.
 * Gates, ревизии и причина отмены проверяются локальной операцией после structural validation.
 */
export const workspaceTransitionSchema = z.strictObject({
  category: workspaceTaskSchema.shape.status.shape.category.optional(),
  outcome: workspaceTaskSchema.shape.outcome.unwrap().optional(),
  cancellationReason: workspaceReasonSchema.optional(),
  execution: workspaceTaskSchema.shape.execution.optional(),
  acceptance: workspaceTaskSchema.shape.acceptance.optional(),
  delivery: workspaceTaskSchema.shape.delivery.optional(),
});
