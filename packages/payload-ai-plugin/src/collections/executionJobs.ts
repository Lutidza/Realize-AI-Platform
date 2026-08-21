/**
 * @file packages/payload-ai-plugin/src/collections/executionJobs.ts
 * @version 2026-08-21
 * @description Defines the durable queue and redacted evidence for isolated code jobs.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import { CHANGE_REQUESTS_SLUG, EXECUTION_JOBS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Builds the hidden durable execution queue owned by the plugin. */
export const createExecutionJobsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: EXECUTION_JOBS_SLUG,
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
        name: "requestedBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
      {
        index: true,
        name: "status",
        options: [
          "queued",
          "preparing_workspace",
          "running",
          "validating",
          "completed",
          "failed",
          "blocked",
          "cancelled",
        ],
        required: true,
        type: "select",
      },
      {
        name: "stage",
        options: [
          "queued",
          "workspace_preparation",
          "implementation",
          "validation",
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
        name: "executionKey",
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
      { name: "approvedVersion", required: true, type: "number" },
      { index: true, name: "boundPlanHash", required: true, type: "text" },
      { index: true, name: "boundScopeHash", required: true, type: "text" },
      { name: "allowedPaths", required: true, type: "json" },
      { name: "checks", required: true, type: "json" },
      { name: "capabilityNonce", required: true, type: "text" },
      { name: "capabilityIssuedAt", required: true, type: "date" },
      {
        index: true,
        name: "capabilityExpiresAt",
        required: true,
        type: "date",
      },
      {
        index: true,
        name: "capabilityTokenHash",
        required: true,
        type: "text",
      },
      { name: "workerID", type: "text" },
      { name: "changedPaths", type: "json" },
      { name: "diff", type: "textarea" },
      { index: true, name: "diffHash", type: "text" },
      { name: "diffStat", type: "json" },
      {
        defaultValue: false,
        name: "diffTruncated",
        required: true,
        type: "checkbox",
      },
      { index: true, name: "evidenceHash", type: "text" },
      { name: "workerSummary", type: "textarea" },
      { name: "errorSummary", type: "textarea" },
      { name: "startedAt", type: "date" },
      { name: "finishedAt", type: "date" },
      { index: true, name: "artifactsExpireAt", required: true, type: "date" },
    ],
    timestamps: true,
    versions: false,
  };
};
