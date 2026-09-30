/**
 * @file packages/ai-contracts/src/designWorkspace.schemas.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет привязку файловой проекции к точной сохранённой версии макета.
 * @see documentation/specifications/design-workshop.md
 */
import { z } from "zod";
import { DESIGN_WORKSHOP_LIMITS as limits } from "./designWorkshop.constants";
import {
  designFilePathSchema,
  designMutationReceiptSchema,
  designSnapshotSchema,
} from "./designWorkshop.schemas";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.uuid().refine((value) => value === value.toLowerCase());

/** Источник назначает authenticated facade; pin сам по себе не является разрешением. */
export const designWorkspacePinSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  bindingId: identifier,
  projectId: identifier,
  revision: designMutationReceiptSchema.shape.revision.extend({
    revisionId: identifier,
    number: z.number().int().min(1).max(limits.revisionsPerProject),
  }),
});

export const designWorkspaceSourceSchema = z.strictObject({
  pin: designWorkspacePinSchema,
  snapshot: designSnapshotSchema,
});

export const designWorkspaceManifestSchema = designWorkspacePinSchema
  .extend({
    files: z
      .array(
        z.strictObject({
          path: designFilePathSchema,
          sha256: hash,
          bytes: z.number().int().min(0).max(limits.fileBytes),
        }),
      )
      .max(limits.files),
  })
  .superRefine((manifest, context) => {
    const paths = manifest.files.map((file) => file.path.toLowerCase());
    if (
      new Set(paths).size !== paths.length ||
      paths.some((path) =>
        paths.some((other) => other.startsWith(`${path}/`)),
      ) ||
      manifest.files.reduce((sum, file) => sum + file.bytes, 0) >
        limits.snapshotFileBytes
    )
      context.addIssue({
        code: "custom",
        message: "Некорректный manifest файлов макета.",
      });
  });

/** Квитанция пригодна для передачи между каналами и не раскрывает host path. */
export const designWorkspaceReceiptSchema = designWorkspacePinSchema.extend({
  mode: z.literal("snapshot_directory"),
  manifestHash: hash,
  fileCount: z.number().int().min(0).max(limits.files),
  totalBytes: z.number().int().min(0).max(limits.snapshotFileBytes),
});
