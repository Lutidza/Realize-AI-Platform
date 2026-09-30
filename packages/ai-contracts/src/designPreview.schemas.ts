/**
 * @file packages/ai-contracts/src/designPreview.schemas.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет команды, публичный статус и bounded evidence capture preview.
 * @see documentation/specifications/design-workshop.md
 */
import { z } from "zod";
import { designFilePathSchema } from "./designWorkshop.schemas";
import { designWorkspacePinSchema } from "./designWorkspace.schemas";
import {
  DESIGN_PREVIEW as limits,
  DESIGN_PREVIEW_ERRORS,
  DESIGN_PREVIEW_STATES,
} from "./designPreview.constants";

export const designPreviewRequestSchema = z.strictObject({
  revisionId: z.uuid(),
  entryPath: designFilePathSchema.refine((path) =>
    /^src\/.+\.(tsx|jsx|ts|js)$/.test(path),
  ),
});
export const designPreviewImageSchema = z.strictObject({
  width: z.union([z.literal(390), z.literal(768), z.literal(1440)]),
  height: z.literal(limits.height),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(limits.imageBytes),
});
export const designPreviewEvidenceSchema = z
  .strictObject({
    renderer: z.literal(limits.renderer),
    source: designWorkspacePinSchema,
    entryPath: designPreviewRequestSchema.shape.entryPath,
    toolchain: z.strictObject({
      esbuild: z.string().regex(/^[0-9A-Za-z.+_-]{1,80}$/),
      react: z.string().regex(/^[0-9A-Za-z.+_-]{1,80}$/),
      reactDom: z.string().regex(/^[0-9A-Za-z.+_-]{1,80}$/),
      chromium: z.string().regex(/^[0-9A-Za-z.+_-]{1,80}$/),
    }),
    images: z.array(designPreviewImageSchema).length(3),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.images.map((image) => image.width)).size !== 3 ||
      value.images.reduce((sum, image) => sum + image.bytes, 0) >
        limits.imagesBytes
    )
      context.addIssue({
        code: "custom",
        message: "Недопустимый набор снимков.",
      });
  });
export const designPreviewJobSchema = z
  .strictObject({
    jobId: z.uuid(),
    projectId: z.uuid(),
    source: designWorkspacePinSchema,
    entryPath: designPreviewRequestSchema.shape.entryPath,
    state: z.enum(DESIGN_PREVIEW_STATES),
    attempt: z.number().int().min(0).max(limits.attempts),
    createdAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    error: z.enum(DESIGN_PREVIEW_ERRORS).nullable(),
    evidence: designPreviewEvidenceSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.projectId !== value.source.projectId ||
      (value.state === "completed") !== Boolean(value.evidence) ||
      (value.state === "failed") !== Boolean(value.error) ||
      (value.evidence &&
        (JSON.stringify(value.source) !==
          JSON.stringify(value.evidence.source) ||
          value.entryPath !== value.evidence.entryPath))
    )
      context.addIssue({
        code: "custom",
        message: "Несогласованное состояние задания предпросмотра.",
      });
  });
