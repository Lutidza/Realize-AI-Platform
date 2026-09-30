/**
 * @file services/ai-execution-worker/src/design-workshop/designWorkspaceStorage.schemas.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет служебный checkpoint материализации перед восстановлением попытки.
 * @see documentation/specifications/design-workshop.md
 */
import { z } from "zod";
import { designWorkspaceReceiptSchema } from "@realize/ai-contracts";

export const designWorkspaceCheckpointSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  phase: z.enum(["staging", "prepared"]),
  receipt: designWorkspaceReceiptSchema,
});
