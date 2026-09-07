/**
 * @file packages/payload-ai-plugin/src/collections/aiConfigDrafts.ts
 * @version 2026-09-01
 * @description Хранит mutable installation configuration draft aggregate.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { CollectionConfig } from "payload";

import { AI_CONFIG_DRAFTS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Creates a hidden aggregate with explicit optimistic revision ownership. */
export const createAIConfigDraftsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();
  return {
    slug: AI_CONFIG_DRAFTS_SLUG,
    access: {
      create: access.deny,
      delete: access.deny,
      read: access.read,
      update: access.deny,
    },
    admin: {
      group: options.admin.group,
      hidden: true,
      useAsTitle: "draftID",
    },
    fields: [
      {
        index: true,
        name: "draftID",
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
      {
        defaultValue: "editing",
        index: true,
        name: "state",
        options: ["editing", "validating", "ready", "released"],
        required: true,
        type: "select",
      },
      {
        defaultValue: 1,
        min: 1,
        name: "revision",
        required: true,
        type: "number",
      },
      { index: true, name: "baseReleaseID", type: "text" },
      { name: "baseReleaseManifestHash", type: "text" },
      { defaultValue: [], name: "artifacts", required: true, type: "json" },
      {
        name: "createdBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
      {
        name: "updatedBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
    ],
    timestamps: true,
    versions: false,
  };
};
