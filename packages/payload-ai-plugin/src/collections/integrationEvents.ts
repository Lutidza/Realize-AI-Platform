/**
 * @file packages/payload-ai-plugin/src/collections/integrationEvents.ts
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Хранит append-only redacted audit событий управления интеграциями.
 */

import type { CollectionConfig } from "payload";

import { INTEGRATION_EVENTS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Creates a hidden append-only audit log without credential material. */
export const createIntegrationEventsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: INTEGRATION_EVENTS_SLUG,
    access: {
      create: access.deny,
      delete: access.deny,
      read: access.read,
      update: access.deny,
    },
    admin: { group: options.admin.group, hidden: true },
    fields: [
      { index: true, name: "provider", required: true, type: "text" },
      { index: true, name: "connectionKey", required: true, type: "text" },
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
        options: ["saved", "tested", "disconnected"],
        required: true,
        type: "select",
      },
      {
        name: "status",
        options: ["passed", "failed"],
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
      { name: "summary", required: true, type: "textarea" },
      { defaultValue: {}, name: "metadata", required: true, type: "json" },
    ],
    timestamps: true,
    versions: false,
  };
};
