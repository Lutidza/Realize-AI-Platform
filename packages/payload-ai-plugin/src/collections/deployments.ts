/**
 * @file packages/payload-ai-plugin/src/collections/deployments.ts
 * @owner packages/payload-ai-plugin
 * @purpose Defines the durable local-preview promotion queue and redacted evidence.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import {
  CHANGE_REQUESTS_SLUG,
  DEPLOYMENTS_SLUG,
  EXECUTION_JOBS_SLUG,
} from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Builds the hidden deployment aggregate used by the local preview worker. */
export const createDeploymentsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: DEPLOYMENTS_SLUG,
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
        name: "executionJob",
        relationTo: EXECUTION_JOBS_SLUG as CollectionSlug,
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
        defaultValue: "local-preview",
        index: true,
        name: "environment",
        options: ["local-preview"],
        required: true,
        type: "select",
      },
      {
        index: true,
        name: "status",
        options: [
          "queued",
          "preparing_workspace",
          "running_checks",
          "reviewing",
          "committing",
          "starting_preview",
          "ready",
          "accepted",
          "rejected",
          "failed",
          "blocked",
          "cancelled",
          "expired",
        ],
        required: true,
        type: "select",
      },
      {
        defaultValue: "pending",
        index: true,
        name: "runtimeState",
        options: ["pending", "active", "stopped"],
        required: true,
        type: "select",
      },
      {
        name: "stage",
        options: [
          "queued",
          "workspace_preparation",
          "validation",
          "independent_review",
          "commit",
          "preview_startup",
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
        name: "deploymentKey",
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
      { index: true, name: "baseCommit", required: true, type: "text" },
      { index: true, name: "sourceDiffHash", required: true, type: "text" },
      {
        index: true,
        name: "sourceEvidenceHash",
        required: true,
        type: "text",
      },
      {
        index: true,
        name: "boundImplementationHash",
        required: true,
        type: "text",
      },
      {
        index: true,
        name: "branch",
        required: true,
        type: "text",
        unique: true,
      },
      {
        index: true,
        name: "workspaceID",
        required: true,
        type: "text",
        unique: true,
      },
      { name: "requiredChecks", required: true, type: "json" },
      { name: "workerID", type: "text" },
      {
        defaultValue: "local-git-preview",
        name: "artifactKind",
        options: ["local-git-preview"],
        required: true,
        type: "select",
      },
      { index: true, name: "commitSHA", type: "text" },
      { index: true, name: "treeHash", type: "text" },
      { index: true, name: "artifactHash", type: "text" },
      { index: true, name: "evidenceHash", type: "text" },
      {
        name: "reviewStatus",
        options: ["approved", "changes_requested"],
        type: "select",
      },
      { name: "reviewSummary", type: "textarea" },
      { name: "reviewFindings", type: "json" },
      { index: true, name: "reviewEvidenceHash", type: "text" },
      { name: "reviewModel", type: "text" },
      { name: "reviewCompletedAt", type: "date" },
      { name: "previewURL", type: "text" },
      { name: "healthSummary", type: "textarea" },
      { name: "errorSummary", type: "textarea" },
      { admin: { hidden: true }, name: "databaseName", type: "text" },
      { admin: { hidden: true }, name: "processID", type: "number" },
      { name: "startedAt", type: "date" },
      { name: "completedAt", type: "date" },
      { index: true, name: "expiresAt", required: true, type: "date" },
    ],
    timestamps: true,
    versions: false,
  };
};
