/**
 * @file packages/payload-ai-plugin/src/collections/approvals.ts
 * @version 2026-08-21
 * @description Defines append-only plan, implementation and preview decisions.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import { APPROVALS_SLUG, CHANGE_REQUESTS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Builds the hidden append-only approval audit collection. */
export const createApprovalsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: APPROVALS_SLUG,
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
        name: "changeRequest",
        relationTo: CHANGE_REQUESTS_SLUG as CollectionSlug,
        required: true,
        type: "relationship",
      },
      {
        defaultValue: "PLAN_APPROVAL",
        name: "type",
        options: [
          "PLAN_APPROVAL",
          "IMPLEMENTATION_ACCEPTANCE",
          "PREVIEW_ACCEPTANCE",
        ],
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
      { index: true, name: "boundHash", required: true, type: "text" },
      { index: true, name: "diffHash", type: "text" },
      { index: true, name: "artifactHash", type: "text" },
      { name: "targetEnvironment", type: "text" },
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
