/**
 * @file packages/payload-ai-plugin/src/collections/releaseCandidates.ts
 * @version 2026-08-22
 * @description Хранит отдельную очередь OCI-кандидатов и проверенное release evidence.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import {
  CHANGE_REQUESTS_SLUG,
  DEPLOYMENTS_SLUG,
  RELEASE_CANDIDATES_SLUG,
} from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Создаёт скрытый aggregate для provider-neutral release orchestrator. */
export const createReleaseCandidatesCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: RELEASE_CANDIDATES_SLUG,
    access: {
      create: access.deny,
      delete: access.deny,
      read: access.read,
      update: access.deny,
    },
    admin: { group: options.admin.group, hidden: true },
    fields: [
      {
        index: true,
        name: "changeRequest",
        relationTo: CHANGE_REQUESTS_SLUG as CollectionSlug,
        required: true,
        type: "relationship",
      },
      {
        index: true,
        name: "previewDeployment",
        relationTo: DEPLOYMENTS_SLUG as CollectionSlug,
        required: true,
        type: "relationship",
      },
      {
        index: true,
        name: "initiatedBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
      {
        defaultValue: "oci-preview",
        index: true,
        name: "environment",
        options: ["oci-preview"],
        required: true,
        type: "select",
      },
      {
        defaultValue: "production",
        index: true,
        name: "targetEnvironment",
        options: ["production"],
        required: true,
        type: "select",
      },
      {
        defaultValue: "oci-image",
        name: "artifactKind",
        options: ["oci-image"],
        required: true,
        type: "select",
      },
      {
        index: true,
        name: "status",
        options: [
          "queued",
          "preparing",
          "building",
          "scanning",
          "deploying_preview",
          "verifying_preview",
          "ready",
          "approved",
          "rejected",
          "failed",
          "blocked",
          "expired",
        ],
        required: true,
        type: "select",
      },
      {
        name: "stage",
        options: [
          "queued",
          "source_validation",
          "build",
          "security_evidence",
          "oci_preview",
          "complete",
        ],
        required: true,
        type: "select",
      },
      {
        defaultValue: 0,
        min: 0,
        name: "attempt",
        required: true,
        type: "number",
      },
      {
        index: true,
        name: "candidateKey",
        required: true,
        type: "text",
        unique: true,
      },
      {
        index: true,
        name: "idempotencyKey",
        required: true,
        type: "text",
        unique: true,
      },
      {
        index: true,
        name: "sourcePreviewArtifactHash",
        required: true,
        type: "text",
      },
      {
        index: true,
        name: "sourcePreviewEvidenceHash",
        required: true,
        type: "text",
      },
      {
        index: true,
        name: "sourceAcceptanceHash",
        required: true,
        type: "text",
      },
      { index: true, name: "gitCommit", required: true, type: "text" },
      { name: "workerID", type: "text" },
      { name: "orchestratorReference", type: "text" },
      { index: true, name: "imageDigest", type: "text" },
      { name: "imageRef", type: "text" },
      { index: true, name: "manifestHash", type: "text" },
      { index: true, name: "sbomDigest", type: "text" },
      { name: "signatureRef", type: "text" },
      {
        defaultValue: false,
        name: "signatureVerified",
        required: true,
        type: "checkbox",
      },
      { name: "provenanceRef", type: "text" },
      { defaultValue: [], name: "migrations", required: true, type: "json" },
      { index: true, name: "migrationSetHash", type: "text" },
      { name: "configVersion", type: "text" },
      {
        defaultValue: {},
        name: "pluginVersions",
        required: true,
        type: "json",
      },
      { name: "previewURL", type: "text" },
      {
        defaultValue: "pending",
        name: "previewStatus",
        options: ["pending", "healthy", "unhealthy"],
        required: true,
        type: "select",
      },
      { name: "healthSummary", type: "textarea" },
      { index: true, name: "evidenceHash", type: "text" },
      { name: "errorSummary", type: "textarea" },
      { name: "startedAt", type: "date" },
      { name: "completedAt", type: "date" },
      { index: true, name: "expiresAt", required: true, type: "date" },
    ],
    timestamps: true,
    versions: false,
  };
};
