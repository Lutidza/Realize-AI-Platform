/**
 * @file packages/ai-contracts/src/mcpWorkshop.schemas.ts
 * @version 1.0.0
 * @date 2026-09-26
 * @description Задаёт строгие bounded wire commands и проекции Мастерской без actor и host paths.
 * @see documentation/specifications/design-workshop.md
 */
import { z } from "zod";
import {
  designFilePathSchema,
  designWorkshopCommands,
  designMutationReceiptSchema,
} from "./designWorkshop.schemas";
import {
  designPreviewJobSchema,
  designPreviewRequestSchema,
} from "./designPreview.schemas";
const projectId = z.uuid(),
  revisionId = z.uuid(),
  changeId = z.uuid(),
  jobId = z.uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const page = z.number().int().min(1).max(1000).default(1);
const idempotencyKey = z.uuid();
const reference = z.strictObject({
  revisionId,
  number: z.number().int().positive(),
  contentHash: hash,
});
const project = z.strictObject({
  projectId,
  title: z.string().max(160),
  target: z.enum(["admin", "frontend", "shared"]),
  kind: z.enum(["reference", "interface", "component", "module", "theme"]),
  workspace: z.strictObject({
    mode: z.literal("stored_draft"),
    bindingId: z.uuid(),
  }),
  currentRevision: reference,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const mcpWorkshopIdentitySchema = z.strictObject({
  serverID: z.uuid(),
  clientID: z.uuid(),
  clientRevision: z.number().int().positive(),
});
export const mcpWorkshopInputs = {
  workshop_projects_list: z.strictObject({
    page,
    limit: z.number().int().min(1).max(4).default(4),
  }),
  workshop_project_get: z.strictObject({
    projectId,
    revisionId: revisionId.optional(),
    page,
  }),
  workshop_snapshot_read: z
    .strictObject({
      projectId,
      revisionId,
      section: z.enum(["brief", "sources", "file"]),
      path: designFilePathSchema.optional(),
      offset: z.number().int().min(0).max(1048576).default(0),
      limit: z.number().int().min(1).max(4096).default(1024),
    })
    .refine((v) => (v.section === "file") === Boolean(v.path)),
  workshop_project_create: designWorkshopCommands.create.extend({
    idempotencyKey,
  }),
  workshop_change_prepare: designWorkshopCommands.prepare.extend({
    projectId,
    idempotencyKey,
  }),
  workshop_change_get: z.strictObject({ projectId, changeId, page }),
  workshop_change_apply: z.strictObject({
    projectId,
    changeId,
    candidateHash: hash,
    idempotencyKey,
  }),
  workshop_preview_start: designPreviewRequestSchema.extend({
    projectId,
    idempotencyKey,
  }),
  workshop_preview_get: z.strictObject({ projectId, jobId }),
  workshop_preview_cancel: z.strictObject({ projectId, jobId }),
  workshop_preview_image: z.strictObject({
    projectId,
    jobId,
    width: z.union([z.literal(390), z.literal(768), z.literal(1440)]),
  }),
};
export const mcpWorkshopImageMetadataSchema = z.strictObject({
  jobId,
  source: designPreviewJobSchema.shape.source,
  viewportWidth: z.number(),
  viewportHeight: z.literal(900),
  sourceSha256: hash,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.literal("image/jpeg"),
});
export const mcpWorkshopImageResultSchema = z.strictObject({
  metadata: mcpWorkshopImageMetadataSchema,
  imageData: z.string().max(131072),
});
export const mcpWorkshopOutputs = {
  workshop_projects_list: z.strictObject({
    items: z.array(project),
    page: z.number().int(),
    limit: z.number().int(),
    hasNextPage: z.boolean(),
  }),
  workshop_project_get: z.strictObject({
    project,
    revision: reference,
    files: z
      .array(
        z.strictObject({
          path: designFilePathSchema,
          bytes: z.number().int(),
          sha256: hash,
        }),
      )
      .max(8),
    page: z.number().int(),
    hasNextPage: z.boolean(),
  }),
  workshop_snapshot_read: z.strictObject({
    revision: reference,
    section: z.enum(["brief", "sources", "file"]),
    path: designFilePathSchema.nullable(),
    text: z.string().max(4096),
    offset: z.number().int(),
    nextOffset: z.number().int().nullable(),
    totalCharacters: z.number().int(),
  }),
  workshop_project_create: designMutationReceiptSchema,
  workshop_change_prepare: designMutationReceiptSchema,
  workshop_change_get: z.strictObject({
    projectId,
    changeId,
    baseRevision: reference,
    candidateHash: hash,
    summary: z.string().max(1000),
    summaryTruncated: z.boolean(),
    status: z.enum(["prepared", "applied", "expired"]),
    briefChanged: z.boolean(),
    sourcesChanged: z.boolean(),
    files: z
      .array(
        z.strictObject({
          path: designFilePathSchema,
          kind: z.enum(["added", "modified", "deleted"]),
          beforeHash: hash.nullable(),
          afterHash: hash.nullable(),
        }),
      )
      .max(8),
    page: z.number().int(),
    hasNextPage: z.boolean(),
  }),
  workshop_change_apply: designMutationReceiptSchema,
  workshop_preview_start: designPreviewJobSchema,
  workshop_preview_get: designPreviewJobSchema,
  workshop_preview_cancel: designPreviewJobSchema,
  workshop_preview_image: mcpWorkshopImageMetadataSchema,
};
