/**
 * @file packages/payload-ai-plugin/src/collections/runEvents.ts
 * @version 2026-08-17
 * @description Defines the ordered event projection used for SSE resume and audit summaries.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import { RUN_EVENTS_SLUG, RUNS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

export const createRunEventsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: RUN_EVENTS_SLUG,
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
        name: "run",
        relationTo: RUNS_SLUG as CollectionSlug,
        required: true,
        type: "relationship",
      },
      { index: true, min: 1, name: "sequence", required: true, type: "number" },
      {
        index: true,
        name: "eventID",
        required: true,
        type: "text",
        unique: true,
      },
      { index: true, name: "type", required: true, type: "text" },
      {
        name: "visibility",
        options: ["user-visible", "internal-summary", "redacted"],
        required: true,
        type: "select",
      },
      { name: "payload", required: true, type: "json" },
      { name: "occurredAt", required: true, type: "date" },
    ],
    timestamps: true,
    versions: false,
  };
};
