/**
 * @file packages/payload-ai-plugin/src/collections/aiConfigEvents.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Хранит append-only audit и durable idempotency config mutations.
 * @docref Realize — AI Platform v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { CollectionConfig } from "payload";

import { AI_CONFIG_EVENTS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Creates the bounded response ledger used for exact mutation replay. */
export const createAIConfigEventsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();
  return {
    slug: AI_CONFIG_EVENTS_SLUG,
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
        name: "idempotencyKey",
        required: true,
        type: "text",
        unique: true,
      },
      {
        index: true,
        name: "action",
        options: [
          "draft_created",
          "draft_updated",
          "draft_validated",
          "release_created",
          "config_activated",
          "config_rolled_back",
        ],
        required: true,
        type: "select",
      },
      {
        index: true,
        name: "actor",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
      { index: true, name: "requestHash", required: true, type: "text" },
      {
        name: "resourceKind",
        options: ["draft", "release"],
        required: true,
        type: "select",
      },
      { index: true, name: "resourceID", required: true, type: "text" },
      {
        name: "status",
        options: ["succeeded", "validation_failed"],
        required: true,
        type: "select",
      },
      {
        defaultValue: {},
        name: "responseSnapshot",
        required: true,
        type: "json",
      },
    ],
    timestamps: true,
    versions: false,
  };
};
