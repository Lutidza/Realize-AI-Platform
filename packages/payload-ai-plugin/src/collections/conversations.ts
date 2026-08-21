/**
 * @file packages/payload-ai-plugin/src/collections/conversations.ts
 * @version 2026-08-17
 * @description Defines durable conversation metadata owned by the Payload AI plugin.
 */

import type { CollectionConfig } from "payload";

import { CONVERSATIONS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

export const createConversationsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: CONVERSATIONS_SLUG,
    access: {
      create: access.deny,
      delete: access.deny,
      read: access.read,
      update: access.deny,
    },
    admin: {
      group: options.admin.group,
      hidden: true,
      useAsTitle: "title",
    },
    fields: [
      { index: true, name: "title", required: true, type: "text" },
      {
        admin: { hidden: true },
        index: true,
        name: "idempotencyKey",
        required: true,
        type: "text",
        unique: true,
      },
      {
        defaultValue: "active",
        index: true,
        name: "status",
        options: ["active", "archived"],
        required: true,
        type: "select",
      },
      {
        index: true,
        name: "createdBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
      { index: true, name: "lastMessageAt", required: true, type: "date" },
    ],
    timestamps: true,
    versions: false,
  };
};
