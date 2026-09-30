/**
 * @file packages/ai-contracts/src/aiInstructionOutputs.config.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Описывает явные wire DTO источников, покрытия и возможностей S1.
 * @see documentation/specifications/internal-mcp.md
 */
import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const path = z.string().min(1).max(4096);
export const aiSourceAuthoritySchema = z.enum([
  "project",
  "policy",
  "procedure",
  "reference",
]);
export const aiSourceSchema = z.strictObject({
  path,
  sha256: hash,
  byteLength: z.number().int().nonnegative(),
  artifactId: z.string().max(256).nullable(),
  authority: aiSourceAuthoritySchema,
  category: z.enum([
    "agents",
    "registry",
    "rule",
    "check",
    "workflow",
    "role",
    "skill",
    "reference",
  ]),
  discoveredFrom: path.nullable(),
  selection: z.enum(["core", "profile", "target", "reference", "requested"]),
  applicability: z.literal("needs_review"),
  contentDelivered: z.literal(false),
});
export const aiContextOutputSchema = z.strictObject({
  resolverVersion: z.literal("1.0"),
  status: z.literal("needs_review"),
  policyHash: hash,
  observedAt: z.string().datetime(),
  sources: z.array(aiSourceSchema).max(96),
  issues: z
    .array(
      z.strictObject({
        code: z.enum([
          "missing_source",
          "unavailable_source",
          "inactive_source",
          "duplicate_artifact_id",
          "prose_review_required",
          "source_limit",
        ]),
        paths: z.array(path).max(2),
      }),
    )
    .max(128),
  deferredReferences: z.array(path).max(128),
  coverage: z.strictObject({
    sourcesRead: z.number().int().nonnegative(),
    bytesRead: z.number().int().nonnegative(),
    truncated: z.boolean(),
    referencesOmitted: z.number().int().nonnegative(),
    completeBootstrap: z.literal(false),
    semantics: z.literal("human_review_required"),
  }),
  fallback: z.literal("read_same_sources_directly"),
});
export const aiCapabilitiesOutputSchema = z.strictObject({
  catalogVersion: z.literal("1.2"),
  snapshotHash: hash,
  observedAt: z.string().datetime(),
  tools: z
    .array(
      z.strictObject({
        name: z.string(),
        description: z.string(),
        effect: z.enum(["read", "write", "execute"]),
        grant: z.enum([
          "context",
          "repository:read",
          "instructions:read",
          "pages:read",
          "workshop:read",
          "workshop:write",
          "workshop:preview",
        ]),
        dependency: z.enum(["none", "repository", "git", "pages", "workshop"]),
        availability: z.enum(["available", "unavailable", "not_probed"]),
        reasonCode: z
          .enum(["DEPENDENCY_UNAVAILABLE", "CALL_TIME_ACL_REQUIRED"])
          .nullable(),
        fallback: z.enum([
          "direct_project_read",
          "authorized_owner_flow",
          "none",
        ]),
      }),
    )
    .max(32),
});
