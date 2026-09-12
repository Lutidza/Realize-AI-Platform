/**
 * @file packages/payload-ai-plugin/src/collections/dataOperations.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Хранит immutable dry-run и lifecycle typed Payload DataOperation.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import {
  CONVERSATIONS_SLUG,
  DATA_OPERATIONS_SLUG,
  MESSAGES_SLUG,
} from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Хранит общий aggregate управляемых операций данных. */
export const createDataOperationsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: DATA_OPERATIONS_SLUG,
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
      { name: "title", required: true, type: "text" },
      {
        index: true,
        name: "kind",
        options: ["catalog.assignCategory.v1", "pages.createDraft.v1"],
        required: true,
        type: "select",
      },
      {
        index: true,
        name: "state",
        options: [
          "awaiting_approval",
          "approved",
          "rejected",
          "applied",
          "apply_failed",
          "rollback_approved",
          "rolled_back",
          "rollback_failed",
        ],
        required: true,
        type: "select",
      },
      {
        defaultValue: 1,
        min: 1,
        name: "version",
        required: true,
        type: "number",
      },
      {
        defaultValue: "R1",
        name: "riskLevel",
        options: ["R1"],
        required: true,
        type: "select",
      },
      {
        defaultValue: "WRITE_CONFIRMATION",
        name: "approvalPolicy",
        options: ["WRITE_CONFIRMATION"],
        required: true,
        type: "select",
      },
      {
        defaultValue: "before-snapshot",
        name: "rollbackStrategy",
        options: ["before-snapshot", "delete-created-draft"],
        required: true,
        type: "select",
      },
      {
        defaultValue: 1,
        max: 1,
        min: 1,
        name: "estimatedCount",
        required: true,
        type: "number",
      },
      {
        index: true,
        name: "requestedBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
      {
        index: true,
        name: "conversation",
        relationTo: CONVERSATIONS_SLUG as CollectionSlug,
        required: true,
        type: "relationship",
      },
      {
        index: true,
        name: "sourceMessage",
        relationTo: MESSAGES_SLUG as CollectionSlug,
        required: true,
        type: "relationship",
      },
      {
        index: true,
        name: "product",
        relationTo: "products",
        type: "relationship",
      },
      {
        index: true,
        name: "category",
        relationTo: "categories",
        type: "relationship",
      },
      { name: "originalRequest", required: true, type: "textarea" },
      { name: "intent", required: true, type: "json" },
      { name: "productSnapshot", type: "json" },
      { name: "categorySnapshot", type: "json" },
      { name: "beforeSnapshot", required: true, type: "json" },
      { name: "afterSnapshot", required: true, type: "json" },
      {
        index: true,
        name: "expectedTargetUpdatedAt",
        type: "text",
      },
      { name: "appliedTargetUpdatedAt", type: "text" },
      { name: "appliedSnapshot", type: "json" },
      { index: true, name: "operationHash", required: true, type: "text" },
      { index: true, name: "rollbackHash", required: true, type: "text" },
      { name: "errorSummary", type: "textarea" },
      { index: true, name: "expiresAt", required: true, type: "date" },
      { name: "appliedAt", type: "date" },
      { name: "rolledBackAt", type: "date" },
      {
        admin: { hidden: true },
        index: true,
        name: "sourceMessageKey",
        required: true,
        type: "text",
        unique: true,
      },
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
