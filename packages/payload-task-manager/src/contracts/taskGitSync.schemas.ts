/**
 * @file packages/payload-task-manager/src/contracts/taskGitSync.schemas.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет команду sync и долговечный строгий Git DTO с actor/time provenance.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import { taskGitObservationsSchema } from "./taskGitObservation.schemas";
import { taskPublicIdSchema } from "./taskManager.schemas";

export const taskGitSyncInputSchema = z.strictObject({
  expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
export const taskGitSyncSchema = taskGitObservationsSchema.safeExtend({
  id: taskPublicIdSchema,
  projectId: taskPublicIdSchema,
  actorId: z.string().min(1).max(128),
  recordedAt: z.iso.datetime(),
});
