/**
 * @file packages/ai-contracts/src/platform-release/platformSourceInventory.validator.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Задаёт строгий контракт исходных артефактов и совместимой комбинации выпуска.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { z } from "zod";
import {
  exactVersionSchema,
  releaseComponentKindSchema,
  releaseHashSchema,
  releaseIdSchema,
  releasePinSchema,
  releaseSourcePathSchema,
  releaseSupportSchema,
} from "./platformVersion.validator.ts";

const orderedUnique = (values: string[]) =>
  values.every((value, index) => index === 0 || values[index - 1] < value);

export const releaseSourceFileSchema = z.strictObject({
  path: releaseSourcePathSchema,
  sha256: releaseHashSchema,
});

export const platformComponentSchema = releasePinSchema.extend({
  kind: releaseComponentKindSchema,
  owner: z.literal("platform-owner"),
  files: z
    .array(releaseSourceFileSchema)
    .min(1)
    .max(20000)
    .refine(
      (files) => orderedUnique(files.map((file) => file.path)),
      "Source files must be sorted and unique",
    ),
});

export const platformMigrationSchema = z.strictObject({
  id: z.string().regex(/^[0-9]{8}_[a-z0-9_]+$/),
  checksum: releaseHashSchema,
  direction: z.literal("up"),
});

/** Все компоненты образуют одну разрешённую exact-комбинацию; неизвестных fallback нет. */
export const platformSourceInventorySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    platformVersion: exactVersionSchema,
    components: z
      .array(platformComponentSchema)
      .min(1)
      .max(512)
      .refine(
        (items) => orderedUnique(items.map((item) => item.id)),
        "Components must be sorted and unique",
      ),
    unavailable: z
      .array(
        z.strictObject({
          kind: releaseComponentKindSchema,
          reason: z.string().min(1).max(1000),
        }),
      )
      .max(32),
    schema: z.strictObject({
      migrations: z
        .array(platformMigrationSchema)
        .min(1)
        .max(10000)
        .refine(
          (items) =>
            new Set(items.map((item) => item.id)).size === items.length,
          "Duplicate migrations",
        ),
      migrationSetHash: releaseHashSchema,
      migrationOrderHash: releaseHashSchema,
      recovery: z.literal("separate-database-plan-required"),
    }),
    compatibility: z.strictObject({
      mode: z.literal("exact-component-set"),
      extensionPoints: z
        .array(
          z.strictObject({
            id: releaseIdSchema,
            version: exactVersionSchema,
            providerComponentId: releaseIdSchema,
          }),
        )
        .max(64),
    }),
    support: releaseSupportSchema,
  })
  .superRefine((value, context) => {
    const present = new Set(value.components.map((item) => item.kind));
    const core = value.components.find(
      (item) => item.id === "realize-platform",
    );
    if (
      core?.kind !== "core-package" ||
      core.version !== value.platformVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "Platform version differs from core component",
      });
    }
    const unavailable = value.unavailable.map((item) => item.kind);
    if (
      new Set(unavailable).size !== unavailable.length ||
      unavailable.some((kind) => present.has(kind))
    ) {
      context.addIssue({
        code: "custom",
        message: "Ambiguous component availability",
      });
    }
    for (const kind of releaseComponentKindSchema.options) {
      if (!present.has(kind) && !unavailable.includes(kind)) {
        context.addIssue({
          code: "custom",
          message: `Missing version unit: ${kind}`,
        });
      }
    }
    for (const kind of [
      "core-package",
      "profile",
      "api-contract",
      "data-schema",
      "system-ai",
      "admin-ai-schema",
      "compiler",
      "quality-pack",
      "ci-policy",
    ] as const) {
      if (!present.has(kind))
        context.addIssue({
          code: "custom",
          message: `Required component unavailable: ${kind}`,
        });
    }
    const points = value.compatibility.extensionPoints;
    if (
      new Set(points.map((point) => point.id)).size !== points.length ||
      points.some(
        (point) =>
          !value.components.some(
            (item) => item.id === point.providerComponentId,
          ),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid extension point provider",
      });
    }
  });
