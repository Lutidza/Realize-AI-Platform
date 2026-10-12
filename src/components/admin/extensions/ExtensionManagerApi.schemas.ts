/**
 * @file src/components/admin/extensions/ExtensionManagerApi.schemas.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Собирает app response schemas из публичных core DTO schemas без копий доменных документов.
 */
import { z } from "zod";
import {
  extensionCatalogDtoSchema,
  extensionTargetStateSchema,
  extensionAppearanceReceiptDtoSchema,
  extensionAppearancePlanDtoSchema,
  EXTENSION_APPEARANCE_LIMITS,
} from "@realize/payload-extension-manager/contracts";
import type {
  ExtensionManagerSnapshotDto,
  ExtensionPrepareResponseDto,
  ExtensionApplyResponseDto,
} from "@realize/payload-extension-manager/contracts";

export const extensionManagerSnapshotSchema: z.ZodType<ExtensionManagerSnapshotDto> =
  z.strictObject({
    catalog: extensionCatalogDtoSchema,
    storage: z.enum(["ready", "requires_schema"]),
    targets: z.strictObject({
      admin: extensionTargetStateSchema,
      frontend: extensionTargetStateSchema,
    }),
    history: z
      .array(extensionAppearanceReceiptDtoSchema)
      .max(EXTENSION_APPEARANCE_LIMITS.receipts),
    permissions: z.strictObject({
      manageAppearance: z.boolean(),
      installCode: z.boolean(),
    }),
    codeInstallation: z.strictObject({
      ready: z.literal(false),
      reason: z.literal("DELIVERY_ADAPTER_UNAVAILABLE"),
    }),
  });
export const extensionPrepareResponseSchema: z.ZodType<ExtensionPrepareResponseDto> =
  z.strictObject({
    plan: extensionAppearancePlanDtoSchema,
    replayed: z.boolean(),
  });
export const extensionApplyResponseSchema: z.ZodType<ExtensionApplyResponseDto> =
  z.strictObject({
    receipt: extensionAppearanceReceiptDtoSchema,
    replayed: z.boolean(),
  });
