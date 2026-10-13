/**
 * @file packages/payload-task-manager/src/contracts/workspace/workspaceTask.validator.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет локальную ревизию задачи с отдельными статусом, исполнением, приёмкой и delivery.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import {
  WORKSPACE_CONTRACT_LIMITS,
  WORKSPACE_EXECUTION_STATES,
} from "./workspaceContractLimits.constants";
import {
  workspaceEvidenceSchema,
  workspaceHashSchema,
  workspaceMetadataIdSchema,
  workspacePathSchema,
  workspaceRevisionSchema,
  workspaceTimestampSchema,
  workspaceUuidSchema,
} from "./workspaceScalarSchemas.validator";
import { validateWorkspaceUniqueIds } from "./validateWorkspaceUniqueIds.util";

/**
 * Локальное досье сохраняет server refs отдельно от собственной идентичности.
 * Схема проверяет форму; gates перехода и факт публикации принадлежат владельцу операции.
 */
export const workspaceTaskSchema = z.strictObject({
  schemaVersion: z.literal(1),
  localDossierId: workspaceUuidSchema,
  localKey: z
    .string()
    .min(1)
    .max(WORKSPACE_CONTRACT_LIMITS.localKey)
    .regex(/^[a-z0-9-]+$/),
  revision: workspaceRevisionSchema,
  title: z.string().trim().min(1).max(WORKSPACE_CONTRACT_LIMITS.title),
  createdAt: workspaceTimestampSchema,
  updatedAt: workspaceTimestampSchema,
  closedAt: workspaceTimestampSchema.nullable(),
  archivedAt: workspaceTimestampSchema.nullable(),
  status: z.strictObject({
    id: workspaceMetadataIdSchema,
    category: z.enum(["open", "active", "done", "closed"]),
  }),
  outcome: z.enum(["succeeded", "cancelled"]).nullable(),
  execution: z.strictObject({
    state: z.enum(WORKSPACE_EXECUTION_STATES).nullable(),
    runtimeRef: z
      .strictObject({
        owner: workspaceMetadataIdSchema,
        id: workspaceMetadataIdSchema,
      })
      .nullable(),
    stageId: workspaceMetadataIdSchema.nullable(),
    attemptId: workspaceUuidSchema.nullable(),
  }),
  acceptance: z.strictObject({
    required: z.boolean(),
    state: z.enum(["not_requested", "pending", "accepted", "rejected"]),
    resultHash: workspaceHashSchema.nullable(),
    criteriaHash: workspaceHashSchema.nullable(),
    decidedAt: workspaceTimestampSchema.nullable(),
  }),
  delivery: z.strictObject({
    required: z.boolean(),
    state: z.enum(["not_requested", "pending", "completed"]),
    evidence: z
      .array(workspaceEvidenceSchema)
      .max(WORKSPACE_CONTRACT_LIMITS.references),
  }),
  requiredChecks: z
    .array(workspaceMetadataIdSchema)
    .max(WORKSPACE_CONTRACT_LIMITS.checks)
    .superRefine((ids, context) => validateWorkspaceUniqueIds(ids, context)),
  result: z
    .strictObject({
      path: workspacePathSchema,
      hash: workspaceHashSchema,
      criteriaHash: workspaceHashSchema,
      revision: workspaceRevisionSchema,
    })
    .nullable(),
  taskRef: z
    .strictObject({
      id: workspaceUuidSchema,
      revision: workspaceRevisionSchema,
      projectId: workspaceUuidSchema,
      listId: workspaceUuidSchema,
    })
    .nullable(),
  legacy: z
    .strictObject({
      originalBodyHash: workspaceHashSchema,
      recordedAt: workspaceTimestampSchema,
    })
    .nullable(),
});
