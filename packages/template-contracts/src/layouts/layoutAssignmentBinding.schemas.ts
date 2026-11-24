/**
 * @file packages/template-contracts/src/layouts/layoutAssignmentBinding.schemas.ts
 * @version 1.0.0
 * @date 2026-11-18
 * @description Проверяет сериализуемую фиксацию точной версии макета в назначении без разрешения runtime.
 * @see documentation/specifications/extension-management.md
 */
import { z } from "zod";
import { layoutVersionedRefSchema } from "./layoutDescriptor.schemas";
import { templateLayoutLocalIdSchema } from "./templateLayoutCatalog.schemas";

/** Server-derived snapshot: форма hash не доказывает его подлинность или наличие reference в каталоге. */
export const layoutAssignmentBindingSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  localId: templateLayoutLocalIdSchema,
  reference: layoutVersionedRefSchema,
  catalogHash: z.string().regex(/^[a-f0-9]{64}$/),
});
