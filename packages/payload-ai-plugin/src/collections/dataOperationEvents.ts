/**
 * @file packages/payload-ai-plugin/src/collections/dataOperationEvents.ts
 * @version 2026-08-28
 * @description Хранит append-only audit и durable outbox событий DataOperation.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import { DATA_OPERATION_EVENTS_SLUG, DATA_OPERATIONS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Creates the transactionally written audit/outbox collection. */
export const createDataOperationEventsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: DATA_OPERATION_EVENTS_SLUG,
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
        name: "dataOperation",
        relationTo: DATA_OPERATIONS_SLUG as CollectionSlug,
        required: true,
        type: "relationship",
      },
      {
        index: true,
        name: "type",
        options: [
          "preview_created",
          "write_approved",
          "write_rejected",
          "apply_succeeded",
          "apply_failed",
          "rollback_approved",
          "rollback_succeeded",
          "rollback_failed",
        ],
        required: true,
        type: "select",
      },
      { name: "fromState", type: "text" },
      { name: "toState", required: true, type: "text" },
      {
        name: "actor",
        relationTo: options.userCollection,
        type: "relationship",
      },
      { name: "payload", required: true, type: "json" },
      { index: true, name: "topic", required: true, type: "text" },
      {
        defaultValue: "pending",
        index: true,
        name: "deliveryStatus",
        options: ["pending", "delivered"],
        required: true,
        type: "select",
      },
      { index: true, name: "occurredAt", required: true, type: "date" },
      {
        admin: { hidden: true },
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
