/**
 * @file packages/payload-ai-plugin/src/collections/checkResults.ts
 * @version 2026-08-21
 * @description Defines append-only verification evidence for execution and preview jobs.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import {
  CHECK_RESULTS_SLUG,
  DEPLOYMENTS_SLUG,
  EXECUTION_JOBS_SLUG,
} from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Builds the hidden append-only check evidence collection. */
export const createCheckResultsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: CHECK_RESULTS_SLUG,
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
        name: "executionJob",
        relationTo: EXECUTION_JOBS_SLUG as CollectionSlug,
        type: "relationship",
      },
      {
        index: true,
        name: "deployment",
        relationTo: DEPLOYMENTS_SLUG as CollectionSlug,
        type: "relationship",
      },
      {
        defaultValue: "execution",
        index: true,
        name: "stage",
        options: ["execution", "preview_validation", "preview_smoke"],
        required: true,
        type: "select",
      },
      { min: 1, name: "sequence", required: true, type: "number" },
      { name: "command", required: true, type: "text" },
      {
        index: true,
        name: "status",
        options: ["passed", "failed"],
        required: true,
        type: "select",
      },
      { name: "startedAt", required: true, type: "date" },
      { name: "finishedAt", required: true, type: "date" },
      { min: 0, name: "durationMs", required: true, type: "number" },
      { name: "outputSummary", type: "textarea" },
      { index: true, name: "evidenceHash", required: true, type: "text" },
      {
        index: true,
        name: "resultKey",
        required: true,
        type: "text",
        unique: true,
      },
    ],
    timestamps: true,
    versions: false,
  };
};
