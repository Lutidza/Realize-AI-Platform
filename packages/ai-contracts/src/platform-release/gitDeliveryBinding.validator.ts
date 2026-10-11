/**
 * @file packages/ai-contracts/src/platform-release/gitDeliveryBinding.validator.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Разделяет доверенные назначения системного и клиентского Git без credentials.
 * @see documentation/delivery/02-ci-release-deploy.md
 */

import { z } from "zod";
import { releaseIdSchema } from "./platformVersion.validator.ts";

export const gitDeliveryActionSchema = z.enum([
  "read",
  "publish-source",
  "publish-release",
  "deploy",
]);

const gitRefSchema = z
  .string()
  .max(256)
  .regex(/^refs\/(heads|tags)\/[A-Za-z0-9._/-]+$/)
  .refine(
    (value) =>
      !value.includes("..") &&
      !value.includes("//") &&
      !value.endsWith("/") &&
      !value.endsWith(".") &&
      value
        .split("/")
        .every((part) => !part.startsWith(".") && !part.endsWith(".lock")),
  );

const shared = {
  connectionId: releaseIdSchema,
  revision: z.number().int().positive().safe(),
  principalId: releaseIdSchema,
  repository: z.strictObject({
    provider: z.literal("github"),
    id: z.string().regex(/^[1-9]\d*$/),
    slug: z
      .string()
      .max(200)
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  }),
  allowedActions: z.array(gitDeliveryActionSchema).min(1).max(4),
  allowedRefs: z.array(gitRefSchema).min(1).max(64),
};

/** Это снимок server-owned policy, а не полномочия, принятые из prompt или Admin DTO. */
export const gitDeliveryBindingSchema = z
  .discriminatedUnion("purpose", [
    z.strictObject({
      ...shared,
      purpose: z.literal("platform-core"),
      authority: z.literal("platform-owner"),
      configurationOwner: z.literal("control-plane"),
    }),
    z.strictObject({
      ...shared,
      purpose: z.literal("customer-project"),
      authority: z.literal("installation-admin"),
      configurationOwner: z.literal("installation"),
      installationId: releaseIdSchema,
    }),
  ])
  .refine(
    (value) =>
      new Set(value.allowedActions).size === value.allowedActions.length &&
      new Set(value.allowedRefs).size === value.allowedRefs.length,
    "Duplicate Git grants",
  );

export const gitDeliveryRequestSchema = z.strictObject({
  purpose: z.enum(["platform-core", "customer-project"]),
  connectionId: releaseIdSchema,
  revision: z.number().int().positive().safe(),
  principalId: releaseIdSchema,
  repositoryId: z.string().regex(/^[1-9]\d*$/),
  installationId: releaseIdSchema.optional(),
  action: gitDeliveryActionSchema,
  ref: gitRefSchema,
});
