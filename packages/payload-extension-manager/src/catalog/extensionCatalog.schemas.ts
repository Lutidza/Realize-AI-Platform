/**
 * @file packages/payload-extension-manager/src/catalog/extensionCatalog.schemas.ts
 * @version 1.2.0
 * @date 2026-11-18
 * @description Проверяет публичную compiled catalog DTO без функций и приватных данных.
 * @see documentation/specifications/extension-management.md
 */
import { z } from "zod";
import {
  templateManifestSchema,
  templateHostCompatibilitySchema,
  templateLayoutCatalogSchema,
  parseTemplateLayoutCatalog,
  isTemplateSettings,
} from "@realize/template-contracts";
import {
  extensionHashSchema,
  extensionSettingsSchema,
} from "../appearance/extensionAppearance.schemas";
import { extensionTemplateReadinessSchema } from "./templateReadiness.schemas";
import { assertExtensionLayoutCatalogScope } from "./assertExtensionLayoutCatalogScope.validator";

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
        z
          .strictObject({
            layoutCatalog: templateLayoutCatalogSchema.optional(),
            readiness: extensionTemplateReadinessSchema.optional(),
            manifest: templateManifestSchema,
            manifestHash: extensionHashSchema,
            settingsSchema: extensionSettingsSchema.refine(
              (schema) =>
                isTemplateSettings(schema) && schema.type === "object",
            ),
            availability: z.literal("compiled"),
          })
          .superRefine((entry, context) => {
            if (!entry.layoutCatalog) return;
            try {
              assertExtensionLayoutCatalogScope(
                parseTemplateLayoutCatalog(entry.layoutCatalog),
                entry.manifest,
              );
            } catch {
              context.addIssue({
                code: "custom",
                path: ["layoutCatalog"],
                message: "Layout catalog does not match template release",
              });
            }
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
