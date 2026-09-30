/**
 * @file packages/payload-ai-plugin/src/collections/DesignPreviewJobs.collection.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Хранит приватную очередь preview, fencing lease и bounded изображения.
 * @see documentation/specifications/design-workshop.md
 */
import type { CollectionConfig } from "payload";
import {
  DESIGN_PREVIEW_ERRORS,
  DESIGN_PREVIEW_STATES,
} from "@realize/ai-contracts";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { DESIGN_PREVIEW_JOBS_SLUG } from "../design-workshop/designWorkshop.constants";
import { createCollectionAccess } from "./access";

export function createDesignPreviewJobsCollection(
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig {
  const { deny } = createCollectionAccess();
  return {
    slug: DESIGN_PREVIEW_JOBS_SLUG,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: options.admin.group },
    versions: false,
    lockDocuments: false,
    timestamps: true,
    fields: [
      { name: "jobId", type: "text", required: true, unique: true },
      { name: "projectId", type: "text", required: true, index: true },
      { name: "revisionId", type: "text", required: true },
      {
        name: "requestedBy",
        type: "relationship",
        relationTo: options.userCollection,
        required: true,
      },
      { name: "sourcePin", type: "json", required: true },
      { name: "mcpAuthorization", type: "json" },
      { name: "entryPath", type: "text", required: true },
      { name: "requestKey", type: "text", required: true, unique: true },
      { name: "requestHash", type: "text", required: true },
      {
        name: "state",
        type: "select",
        required: true,
        options: [...DESIGN_PREVIEW_STATES],
        index: true,
      },
      {
        name: "attempt",
        type: "number",
        required: true,
        defaultValue: 0,
        min: 0,
      },
      { name: "leaseToken", type: "text" },
      { name: "leaseUntil", type: "date", index: true },
      { name: "workerInstance", type: "text" },
      { name: "expiresAt", type: "date", required: true, index: true },
      {
        name: "errorCode",
        type: "select",
        options: [...DESIGN_PREVIEW_ERRORS],
      },
      { name: "evidence", type: "json" },
      { name: "images", type: "json" },
    ],
  };
}
