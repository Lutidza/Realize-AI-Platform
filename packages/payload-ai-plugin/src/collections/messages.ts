/**
 * @file packages/payload-ai-plugin/src/collections/messages.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Хранит текст, вложения, выбранный контекст и источники истории диалога.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import { CONVERSATIONS_SLUG, MESSAGES_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

export const createMessagesCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: MESSAGES_SLUG,
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
        name: "conversation",
        relationTo: CONVERSATIONS_SLUG as CollectionSlug,
        required: true,
        type: "relationship",
      },
      {
        name: "role",
        options: ["user", "assistant", "system"],
        required: true,
        type: "select",
      },
      {
        name: "kind",
        options: [
          "user_message",
          "assistant_message",
          "usage_notice",
          "system_error",
        ],
        required: true,
        type: "select",
      },
      { name: "content", type: "textarea" },
      { name: "turnContext", type: "json" },
      { name: "sources", type: "json" },
      { index: true, name: "runID", type: "text" },
      { index: true, min: 1, name: "sequence", required: true, type: "number" },
      { name: "usageSummary", type: "json" },
      {
        index: true,
        name: "idempotencyKey",
        required: true,
        type: "text",
        unique: true,
      },
    ],
    timestamps: true,
    versions: false,
  };
};
