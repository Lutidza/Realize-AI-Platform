/**
 * @file packages/payload-task-manager/src/contracts/taskManager.schemas.ts
 * @version 1.2.0
 * @date 2026-10-19
 * @description Проверяет ограниченные команды и DTO Task Manager без доверия полям браузера.
 * @see documentation/specifications/task-management-execution.md
 */
import { z } from "zod";

const publicId = z.uuid();
const actorId = z.string().min(1).max(128);
const title = z.string().trim().min(1).max(200);
const description = z.string().max(20000);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime();

export const taskGitBindingSchema = z.strictObject({
  repositoryId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/),
  commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  purpose: z.enum(["platform-core", "customer-project"]),
  source: z.literal("manual"),
  verification: z.literal("unverified"),
});
const editable = {
  title,
  description,
  status: z.enum(["backlog", "in_progress", "review"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assigneeId: actorId.nullable(),
  gitBindings: z
    .array(taskGitBindingSchema)
    .max(50)
    .superRefine((bindings, ctx) => {
      const keys = new Set<string>();
      bindings.forEach((binding, index) => {
        const key = JSON.stringify([
          binding.repositoryId,
          binding.commitSha,
          binding.purpose,
        ]);
        if (keys.has(key))
          ctx.addIssue({
            code: "custom",
            path: [index],
            message: "Привязка коммита повторяется.",
          });
        keys.add(key);
      });
    }),
};

export const taskProjectCreateSchema = z.strictObject({
  title,
  description,
  memberIds: z
    .array(actorId)
    .max(100)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Участники повторяются.",
    ),
});
export const taskProjectUpdateSchema = z.strictObject({
  title,
  description,
  memberIds: z
    .array(actorId)
    .max(101)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Участники повторяются.",
    ),
  expectedRevision: revision,
});
export const taskListCreateSchema = z.strictObject({
  projectId: publicId,
  title,
});
export const taskListUpdateSchema = z.strictObject({
  title,
  expectedRevision: revision,
});
export const taskCreateSchema = z.strictObject({
  projectId: publicId,
  listId: publicId,
  ...editable,
});
/** UUID исходного запроса остаётся тем же при retry и смене авторизованного участника. */
export const taskWorkspaceCreateSchema = taskCreateSchema.extend({
  clientTaskId: publicId.transform((value) => value.toLowerCase()),
});
export const taskUpdateSchema = z.strictObject({
  ...editable,
  expectedRevision: revision,
});
export const taskProjectSchema = z.strictObject({
  id: publicId,
  title,
  description,
  ownerId: actorId,
  memberIds: z.array(actorId).max(101),
  revision,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const taskListSchema = z.strictObject({
  id: publicId,
  projectId: publicId,
  title,
  revision,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const taskSchema = z.strictObject({
  id: publicId,
  key: z.string().regex(/^TASK-[1-9][0-9]*$/),
  projectId: publicId,
  listId: publicId,
  ...editable,
  revision,
  createdBy: actorId,
  updatedBy: actorId,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const taskEventSchema = z.strictObject({
  id: publicId,
  taskId: publicId,
  actorId,
  kind: z.enum(["created", "updated"]),
  revision,
  occurredAt: timestamp,
  summary: z.string().min(1).max(1000),
});
export const taskWorkspaceCreateResultSchema = z.strictObject({
  task: taskSchema,
  disposition: z.enum(["created", "existing"]),
});
export const taskPublicIdSchema = publicId;
