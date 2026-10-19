/**
 * @file .ai/tools/task-workspace/src/remote/remoteWorkspaceRecord.validator.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Проверяет versioned outbox и обязательные данные каждой стадии передачи задачи.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";
import { taskWorkspaceCreateSchema } from "@realize/payload-task-manager/contracts";

export const remoteWorkspaceTargetSchema = z.strictObject({
  baseUrl: z.string().max(2048),
  projectId: z.uuid(),
  listId: z.uuid(),
});
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const remoteWorkspaceSelectionSchema = z.strictObject({
  projectId: z.uuid(),
  listId: z.uuid().nullable(),
  baseUrl: z.string().max(2048).nullable(),
});
const fields = {
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/),
  clientTaskId: z.uuid(),
  phase: z.enum(["queued", "pending", "remote"]),
  dispatches: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  createHash: hash.nullable(),
  target: remoteWorkspaceTargetSchema.nullable(),
  payload: taskWorkspaceCreateSchema.nullable(),
  snapshot: z
    .strictObject({
      localDossierId: z.uuid(),
      revision: z.number().int().positive(),
      documentHash: hash,
    })
    .nullable(),
  taskRef: z
    .strictObject({
      id: z.uuid(),
      revision: z.number().int().positive(),
      projectId: z.uuid(),
      listId: z.uuid(),
    })
    .nullable(),
  reason: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .max(100)
    .nullable(),
};
const currentSchema = z.strictObject({
  ...fields,
  schemaVersion: z.literal(2),
  selection: remoteWorkspaceSelectionSchema.nullable(),
});
// Старые записи читаются без записи: pending payload и createHash остаются прежними.
const legacySchema = z
  .strictObject({ ...fields, schemaVersion: z.literal(1) })
  .transform((record) => ({
    ...record,
    schemaVersion: /** @type {const} */ (2),
    selection: record.target ? { ...record.target } : null,
  }));
export const remoteWorkspaceRecordSchema = z
  .union([currentSchema, legacySchema])
  .superRefine((record, context) => {
    if (
      (record.target &&
        (!record.selection ||
          record.selection.baseUrl !== record.target.baseUrl ||
          record.selection.projectId !== record.target.projectId ||
          record.selection.listId !== record.target.listId)) ||
      (record.phase === "queued" &&
        (record.dispatches !== 0 ||
          record.target ||
          record.payload ||
          record.snapshot)) ||
      (record.phase !== "queued" && record.dispatches < 1) ||
      (record.phase !== "queued" && (!record.target || !record.payload)) ||
      (record.phase === "remote" && !record.taskRef) ||
      (record.phase !== "remote" && record.taskRef) ||
      (record.payload && record.payload.clientTaskId !== record.clientTaskId) ||
      (record.snapshot &&
        record.snapshot.localDossierId !== record.clientTaskId) ||
      (record.taskRef &&
        record.target &&
        (record.taskRef.projectId !== record.target.projectId ||
          record.taskRef.listId !== record.target.listId)) ||
      (record.payload &&
        record.target &&
        (record.payload.projectId !== record.target.projectId ||
          record.payload.listId !== record.target.listId))
    )
      context.addIssue({
        code: "custom",
        message: "Неконсистентный журнал передачи задачи.",
      });
  });
