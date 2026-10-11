/**
 * @file scripts/release/platformReleaseCatalog.validator.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Проверяет декларацию владельцев версий и исходных файлов выпуска.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { z } from "zod";
import {
  exactVersionSchema,
  releaseComponentKindSchema,
  releaseSourcePathSchema,
  releaseSupportSchema,
} from "@realize/ai-contracts/platform-release";

export const platformReleaseCatalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  components: z
    .array(
      z
        .strictObject({
          id: z.string().min(1).max(200),
          kind: releaseComponentKindSchema,
          version: exactVersionSchema.optional(),
          packagePath: releaseSourcePathSchema.optional(),
          sources: z.array(releaseSourcePathSchema).min(1).max(64),
        })
        .refine(
          (value) => Boolean(value.version) !== Boolean(value.packagePath),
          "Exactly one version source is required",
        ),
    )
    .min(1)
    .max(128),
  unavailable: z
    .array(
      z.strictObject({
        kind: releaseComponentKindSchema,
        reason: z.string().min(1).max(1000),
      }),
    )
    .max(32),
  extensionPoints: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(200),
        version: exactVersionSchema,
        providerComponentId: z.string().min(1).max(200),
      }),
    )
    .max(64),
  support: releaseSupportSchema,
});

export const releasePackageSchema = z.object({
  name: z.string().min(1).max(200),
  version: exactVersionSchema,
  dependencies: z.record(z.string(), z.string()).default({}),
});
