/**
 * @file packages/payload-ai-plugin/src/collections/approvals.ts
 * @version 2026-08-22
 * @description Задаёт append-only plan, implementation, preview и release decisions.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import {
  APPROVALS_SLUG,
  CHANGE_REQUESTS_SLUG,
  RELEASE_CANDIDATES_SLUG,
} from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Создаёт скрытую append-only collection аудита approvals. */
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
          "RELEASE_APPROVAL",
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
      {
        index: true,
        name: "releaseCandidate",
        relationTo: RELEASE_CANDIDATES_SLUG as CollectionSlug,
        type: "relationship",
      },
      { index: true, name: "imageDigest", type: "text" },
      { index: true, name: "manifestHash", type: "text" },
      { index: true, name: "migrationSetHash", type: "text" },
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
