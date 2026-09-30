/**
 * @file packages/ai-contracts/src/DesignPreview.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Выводит DTO задания и evidence без worker handles и содержимого PNG.
 * @see documentation/specifications/design-workshop.md
 */
import type { z } from "zod";
import type {
  designPreviewJobSchema,
  designPreviewRequestSchema,
  designPreviewEvidenceSchema,
} from "./designPreview.schemas";
export type DesignPreviewJobDto = z.infer<typeof designPreviewJobSchema>;
export type DesignPreviewRequest = z.infer<typeof designPreviewRequestSchema>;
export type DesignPreviewEvidence = z.infer<typeof designPreviewEvidenceSchema>;
export type DesignPreviewErrorCode = NonNullable<DesignPreviewJobDto["error"]>;
