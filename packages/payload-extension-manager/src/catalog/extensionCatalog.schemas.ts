/**
 * @file packages/payload-extension-manager/src/catalog/extensionCatalog.schemas.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет публичную compiled catalog DTO без функций и приватных данных.
 * @see documentation/specifications/extension-management.md
 */
import { z } from "zod";
import {
  templateManifestSchema,
  templateHostCompatibilitySchema,
} from "@realize/template-contracts";
import {
  extensionHashSchema,
  extensionSettingsSchema,
} from "../appearance/extensionAppearance.schemas";

export const extensionCatalogDtoSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    catalogHash: extensionHashSchema,
    runtimeBuildId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,200}$/)
      .nullable(),
    hostCompatibility: templateHostCompatibilitySchema,
    entries: z
      .array(
        z.strictObject({
          manifest: templateManifestSchema,
          manifestHash: extensionHashSchema,
          settingsSchema: extensionSettingsSchema.refine(
            (schema) => schema.type === "object",
          ),
          availability: z.literal("compiled"),
        }),
      )
      .max(100),
  })
  .refine(
    (catalog) =>
      new Set(
        catalog.entries.map(
          (entry) => `${entry.manifest.id}@${entry.manifest.version}`,
        ),
      ).size === catalog.entries.length,
    {
      message: "Duplicate catalog identity",
    },
  );
