/**
 * @file packages/payload-ai-plugin/src/collections/changeRequests.ts
 * @version 2026-08-22
 * @description Задаёт immutable plan snapshots и управляемый lifecycle до release approval.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import {
  CHANGE_REQUESTS_SLUG,
  CONVERSATIONS_SLUG,
  MESSAGES_SLUG,
} from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

const changeTypes = [
  "QUERY",
  "CONTENT_CHANGE",
  "CATALOG_CHANGE",
  "CONFIG_CHANGE",
  "THEME_CHANGE",
  "CODE_CHANGE",
  "SCHEMA_CHANGE",
  "MIXED_CHANGE",
  "DEPLOYMENT_ONLY",
  "ROLLBACK",
  "AGENCY_ENGINEERING_REQUEST",
];

/** Создаёт скрытую Change Request collection во владении plugin. */
export const createChangeRequestsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: CHANGE_REQUESTS_SLUG,
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
        name: "type",
        options: changeTypes,
        required: true,
        type: "select",
      },
      {
        index: true,
        name: "state",
        options: [
          "awaiting_plan_approval",
          "plan_approved",
          "execution_queued",
          "workspace_preparing",
          "executing",
          "validating",
          "validation_failed",
          "changes_ready",
          "changes_accepted",
          "preview_queued",
          "preview_preparing",
          "preview_validating",
          "preview_reviewing",
          "preview_committing",
          "preview_starting",
          "preview_ready",
          "preview_accepted",
          "preview_failed",
          "release_preparing",
          "awaiting_release_approval",
          "release_approved",
          "release_failed",
          "blocked",
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
        index: true,
        name: "riskLevel",
        options: ["R0", "R1", "R2", "R3", "R4"],
        required: true,
        type: "select",
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
      { name: "originalRequest", required: true, type: "textarea" },
      { name: "normalizedIntent", required: true, type: "textarea" },
      { name: "plan", required: true, type: "textarea" },
      { index: true, name: "planHash", required: true, type: "text" },
      { name: "affectedPaths", required: true, type: "json" },
      { name: "checks", required: true, type: "json" },
      { index: true, name: "scopeHash", required: true, type: "text" },
      { name: "blockedReason", type: "textarea" },
      { index: true, name: "expiresAt", required: true, type: "date" },
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
