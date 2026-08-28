/**
 * @file packages/payload-ai-plugin/src/collections/sourcePromotions.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Хранит durable очередь exact-commit GitHub Pull Request publications.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import {
  CHANGE_REQUESTS_SLUG,
  DEPLOYMENTS_SLUG,
  SOURCE_PROMOTIONS_SLUG,
} from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Создаёт скрытый source-control aggregate без credential material. */
export const createSourcePromotionsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: SOURCE_PROMOTIONS_SLUG,
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
        defaultValue: "github",
        index: true,
        name: "provider",
        options: ["github"],
        required: true,
        type: "select",
      },
      {
        index: true,
        name: "status",
        options: [
          "queued",
          "validating",
          "publishing_ref",
          "creating_pull_request",
          "ready",
          "failed",
          "blocked",
        ],
        required: true,
        type: "select",
      },
      {
        name: "stage",
        options: [
          "queued",
          "source_validation",
          "ref_publication",
          "pull_request",
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
        name: "promotionKey",
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
      { index: true, name: "repositorySlug", required: true, type: "text" },
      {
        min: 1,
        name: "integrationRevision",
        required: true,
        type: "number",
      },
      { index: true, name: "baseBranch", required: true, type: "text" },
      {
        index: true,
        name: "headBranch",
        required: true,
        type: "text",
        unique: true,
      },
      { index: true, name: "gitCommit", required: true, type: "text" },
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
      { name: "workerID", type: "text" },
      { min: 1, name: "pullRequestNumber", type: "number" },
      { name: "pullRequestURL", type: "text" },
      {
        name: "pullRequestState",
        options: ["open", "closed"],
        type: "select",
      },
      { name: "draft", type: "checkbox" },
      { index: true, name: "evidenceHash", type: "text" },
      { name: "errorSummary", type: "textarea" },
      { name: "startedAt", type: "date" },
      { name: "completedAt", type: "date" },
    ],
    timestamps: true,
    versions: false,
  };
};
