/**
 * @file packages/payload-ai-plugin/src/collections/aiConfigReleases.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Хранит immutable content-addressed installation config releases.
 * @docref Realize — AI Platform v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { CollectionConfig } from "payload";

import { AI_CONFIG_RELEASES_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Creates a hidden append-only full snapshot collection. */
export const createAIConfigReleasesCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();
  return {
    slug: AI_CONFIG_RELEASES_SLUG,
    access: {
      create: access.deny,
      delete: access.deny,
      read: access.read,
      update: access.deny,
    },
    admin: {
      group: options.admin.group,
      hidden: true,
      useAsTitle: "releaseID",
    },
    fields: [
      {
        index: true,
        name: "releaseID",
        required: true,
        type: "text",
        unique: true,
      },
      {
        admin: { hidden: true },
        index: true,
        name: "releaseKey",
        required: true,
        type: "text",
        unique: true,
      },
      {
        defaultValue: "1.0",
        name: "schemaVersion",
        options: ["1.0"],
        required: true,
        type: "select",
      },
      { index: true, min: 1, name: "version", required: true, type: "number" },
      { index: true, name: "sourceDraftID", required: true, type: "text" },
      {
        min: 1,
        name: "sourceDraftRevision",
        required: true,
        type: "number",
      },
      { name: "systemMinimumRelease", required: true, type: "text" },
      { name: "systemMaximumRelease", type: "text" },
      { defaultValue: [], name: "artifacts", required: true, type: "json" },
      { index: true, name: "manifestHash", required: true, type: "text" },
      { name: "releasedAt", required: true, type: "date" },
      {
        name: "createdBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
    ],
    timestamps: true,
    versions: false,
  };
};
