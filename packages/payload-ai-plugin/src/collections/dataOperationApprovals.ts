/**
 * @file packages/payload-ai-plugin/src/collections/dataOperationApprovals.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Хранит append-only write и rollback approvals DataOperation.
 * @docref Realize — AI Platform v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import {
  DATA_OPERATION_APPROVALS_SLUG,
  DATA_OPERATIONS_SLUG,
} from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Хранит неизменяемое решение для точного hash и подтверждение проверки публикации. */
export const createDataOperationApprovalsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: DATA_OPERATION_APPROVALS_SLUG,
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
        options: ["WRITE_CONFIRMATION", "ROLLBACK_APPROVAL"],
        required: true,
        type: "select",
      },
      {
        index: true,
        name: "decision",
        options: ["approved", "rejected"],
        required: true,
        type: "select",
      },
      {
        name: "actor",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
      { name: "roleSnapshot", required: true, type: "json" },
      { name: "previewEvidence", type: "json" },
      { index: true, name: "targetHash", required: true, type: "text" },
      { index: true, name: "boundHash", required: true, type: "text" },
      {
        min: 1,
        name: "operationVersion",
        required: true,
        type: "number",
      },
      { name: "comment", type: "textarea" },
      { name: "expiresAt", required: true, type: "date" },
      {
        admin: { hidden: true },
        index: true,
        name: "decisionKey",
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
