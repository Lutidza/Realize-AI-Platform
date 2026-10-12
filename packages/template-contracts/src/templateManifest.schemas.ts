/**
 * @file packages/template-contracts/src/templateManifest.schemas.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет serializable manifest и вход выбора template package.
 * @see documentation/specifications/design-workshop.md
 */

import { z } from "zod";
import { compareTemplateVersions } from "./compareTemplateVersions.util";
import { isTemplateSettings } from "./isTemplateSettings.validator";
import type { TemplateJsonValue } from "./TemplateValue.types";

const identifierSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);

/** Protocol 1.0 намеренно поддерживает только stable SemVer x.y.z. */
const versionSchema = z
  .string()
  .max(64)
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
  .refine(
    (value) =>
      value.split(".").every((part) => Number.isSafeInteger(Number(part))),
    {
      message: "Version segments must be safe integers",
    },
  );

const modeSchema = z.enum(["light", "dark"]);
const capabilitySchema = z.enum([
  "search",
  "create",
  "assistant",
  "notifications",
  "account",
]);
const primitiveSchema = z.enum(["Button", "Input"]);

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const jsonValueSchema: z.ZodType<TemplateJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z
      .record(z.string(), jsonValueSchema)
      .refine(
        (value) =>
          Object.keys(value).every(
            (key) => !["__proto__", "prototype", "constructor"].includes(key),
          ),
        { message: "Reserved settings keys are not supported" },
      ),
  ]),
);

const settingsDefaultsSchema = z.preprocess(
  (input) => (isTemplateSettings(input) ? input : undefined),
  z.record(z.string(), jsonValueSchema),
);

const versionRangeSchema = z
  .strictObject({ minimum: versionSchema, maximumExclusive: versionSchema })
  .refine(
    (value) =>
      compareTemplateVersions(value.minimum, value.maximumExclusive) < 0,
    {
      message: "minimum must be less than maximumExclusive",
    },
  );

const entrySchema = z
  .string()
  .max(200)
  .regex(/^\.\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/);

const capabilitiesSchema = z
  .array(capabilitySchema)
  .max(5)
  .refine(hasUniqueValues)
  .optional();
const targetSchema = z.discriminatedUnion("target", [
  z.strictObject({
    target: z.literal("admin"),
    screens: z
      .array(z.enum(["workspace", "auth", "status"]))
      .min(1)
      .max(3)
      .refine(hasUniqueValues),
    capabilities: capabilitiesSchema,
  }),
  z.strictObject({
    target: z.literal("frontend"),
    screens: z.array(z.literal("page")).length(1),
    capabilities: capabilitiesSchema,
  }),
]);

/** Manifest не содержит свой artifact digest: его фиксирует внешний installation receipt. */
export const templateManifestSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0"),
    id: identifierSchema,
    version: versionSchema,
    packageName: z
      .string()
      .max(214)
      .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/),
    displayName: z.string().trim().min(1).max(160),
    entries: z.strictObject({
      admin: entrySchema.optional(),
      frontend: entrySchema.optional(),
    }),
    targets: z.array(targetSchema).min(1).max(2),
    compatibility: z.strictObject({
      contractVersion: z.literal("1.0"),
      platform: versionRangeSchema,
      react: versionRangeSchema,
      next: versionRangeSchema,
    }),
    settings: z.strictObject({
      schemaVersion: versionSchema,
      schemaPath: z
        .string()
        .max(200)
        .regex(
          /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*\.json$/,
        ),
      defaults: settingsDefaultsSchema,
    }),
    palettes: z
      .array(
        z.strictObject({
          id: identifierSchema,
          version: versionSchema,
          label: z.string().trim().min(1).max(160),
          modes: z.array(modeSchema).min(1).max(2).refine(hasUniqueValues),
        }),
      )
      .min(1)
      .max(20),
    ui: z.strictObject({
      contractVersion: z.literal("1.0"),
      primitives: z.array(primitiveSchema).max(2).refine(hasUniqueValues),
      inheritsDefault: z.literal(true).optional(),
    }),
  })
  .superRefine((manifest, context) => {
    if (!hasUniqueValues(manifest.targets.map((target) => target.target))) {
      context.addIssue({
        code: "custom",
        path: ["targets"],
        message: "Duplicate target",
      });
    }
    for (const target of ["admin", "frontend"] as const) {
      const isDeclared = manifest.targets.some(
        (definition) => definition.target === target,
      );
      if (isDeclared !== (manifest.entries[target] !== undefined)) {
        context.addIssue({
          code: "custom",
          path: ["entries", target],
          message: "Entry and target must be declared together",
        });
      }
    }
    if (!hasUniqueValues(manifest.palettes.map((palette) => palette.id))) {
      context.addIssue({
        code: "custom",
        path: ["palettes"],
        message: "Duplicate palette ID",
      });
    }
    if (
      !manifest.ui.inheritsDefault &&
      !["Button", "Input"].every((slot) =>
        manifest.ui.primitives.some((primitive) => primitive === slot),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["ui", "primitives"],
        message:
          "All primitive slots are required without declared inheritance",
      });
    }
  });

/** Проверяет точный выбор, не принимает latest, произвольный URL или default alias. */
export const templateSelectionSchema = z.strictObject({
  templateId: identifierSchema,
  templateVersion: versionSchema,
  target: z.enum(["admin", "frontend"]),
  paletteId: identifierSchema,
  paletteVersion: versionSchema,
  mode: modeSchema,
});

/** Проверяет реальные версии host перед выбором совместимого пакета. */
export const templateHostCompatibilitySchema = z.strictObject({
  contractVersion: z.literal("1.0"),
  platformVersion: versionSchema,
  reactVersion: versionSchema,
  nextVersion: versionSchema,
  requiredCapabilities: z
    .array(capabilitySchema)
    .max(5)
    .refine(hasUniqueValues)
    .optional(),
});
