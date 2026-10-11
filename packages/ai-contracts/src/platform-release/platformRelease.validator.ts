/**
 * @file packages/ai-contracts/src/platform-release/platformRelease.validator.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Проверяет provenance выпуска и наблюдаемое состояние клиентской установки.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { z } from "zod";
import { gitDeliveryBindingSchema } from "./gitDeliveryBinding.validator.ts";
import { platformSourceInventorySchema } from "./platformSourceInventory.validator.ts";
import {
  exactVersionSchema,
  releaseCommitSchema,
  releaseDigestSchema,
  releaseHashSchema,
  releaseIdSchema,
  releasePinSchema,
  releaseSourcePathSchema,
  releaseTimestampSchema,
} from "./platformVersion.validator.ts";

export const platformReleasePayloadSchema = z.strictObject({
  schemaVersion: z.literal(1),
  releaseId: releaseIdSchema,
  createdAt: releaseTimestampSchema,
  source: z.strictObject({
    git: gitDeliveryBindingSchema.refine(
      (value) => value.purpose === "platform-core",
      "A platform release requires platform-core Git",
    ),
    commit: releaseCommitSchema,
    ref: z.string().min(1).max(256),
  }),
  artifact: z
    .strictObject({
      kind: z.literal("oci-image"),
      digest: releaseDigestSchema,
      reference: z
        .string()
        .regex(/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/),
    })
    .refine(
      (value) => value.reference.endsWith(`@${value.digest}`),
      "Image reference/digest mismatch",
    ),
  build: z.strictObject({
    provider: z.literal("github-actions"),
    workflowPath: releaseSourcePathSchema,
    workflowCommit: releaseCommitSchema,
    runId: z.string().regex(/^[1-9]\d*$/),
    runAttempt: z.number().int().positive().safe(),
    provenanceRef: z.string().min(1).max(2000),
  }),
  inventory: platformSourceInventorySchema,
  inventoryHash: releaseHashSchema,
});

/** Hash связывает содержимое, но подпись и разрешённый issuer проверяет внешний trust owner. */
export const platformReleaseManifestSchema =
  platformReleasePayloadSchema.extend({
    manifestHash: releaseHashSchema,
  });

/** Core origin и project commit независимы; состояние создаёт наблюдатель установки, не модель. */
export const installedPlatformStateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    installationId: releaseIdSchema,
    core: z.strictObject({
      manifestHash: releaseHashSchema,
      sourceCommit: releaseCommitSchema,
      platformVersion: exactVersionSchema,
      imageDigest: releaseDigestSchema,
    }),
    project: z.strictObject({
      git: gitDeliveryBindingSchema.refine(
        (value) => value.purpose === "customer-project",
        "An installation requires customer-project Git",
      ),
      commit: releaseCommitSchema,
      hasUncommittedChanges: z.boolean(),
    }),
    components: z
      .array(releasePinSchema)
      .min(1)
      .max(512)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Duplicate installed components",
      ),
    migrationOrderHash: releaseHashSchema,
    extensions: z
      .array(
        z.strictObject({
          id: releaseIdSchema,
          version: exactVersionSchema,
          sha256: releaseHashSchema,
          extensionPointId: releaseIdSchema,
          extensionPointVersion: exactVersionSchema,
          requires: z
            .array(releasePinSchema)
            .min(1)
            .max(512)
            .refine(
              (items) =>
                new Set(items.map((item) => item.id)).size === items.length,
              "Duplicate extension dependencies",
            ),
        }),
      )
      .max(512)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Duplicate extensions",
      ),
  })
  .refine(
    (value) =>
      value.project.git.purpose === "customer-project" &&
      value.project.git.installationId === value.installationId,
    "Git binding belongs to another installation",
  );
