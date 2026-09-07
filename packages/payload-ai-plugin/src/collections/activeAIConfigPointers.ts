/**
 * @file packages/payload-ai-plugin/src/collections/activeAIConfigPointers.ts
 * @version 2026-09-01
 * @description Хранит append-only историю exact active configuration pointers.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { CollectionConfig } from "payload";

import { ACTIVE_AI_CONFIG_POINTERS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Creates pointer persistence without granting activation authority. */
export const createActiveAIConfigPointersCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();
  return {
    slug: ACTIVE_AI_CONFIG_POINTERS_SLUG,
    access: {
      create: access.deny,
      delete: access.deny,
      read: access.read,
      update: access.deny,
    },
    admin: { group: options.admin.group, hidden: true },
    fields: [
      {
        defaultValue: "installation",
        index: true,
        name: "pointerKey",
        required: true,
        type: "text",
      },
      {
        admin: { hidden: true },
        index: true,
        name: "pointerVersionKey",
        required: true,
        type: "text",
        unique: true,
      },
      { min: 1, name: "version", required: true, type: "number" },
      { index: true, name: "releaseID", required: true, type: "text" },
      { name: "manifestHash", required: true, type: "text" },
      {
        name: "action",
        options: ["activate", "rollback"],
        required: true,
        type: "select",
      },
      { name: "activatedAt", required: true, type: "date" },
      {
        name: "activatedBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
    ],
    timestamps: true,
    versions: false,
  };
};
