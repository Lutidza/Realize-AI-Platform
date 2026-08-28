/**
 * @file packages/payload-ai-plugin/src/collections/integrations.ts
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Хранит provider-neutral configuration и encrypted credential envelopes.
 */

import type { CollectionConfig } from "payload";

import { INTEGRATIONS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Creates a hidden collection accessible only through authorized DTO endpoints. */
export const createIntegrationsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: INTEGRATIONS_SLUG,
    access: {
      create: access.deny,
      delete: access.deny,
      read: access.read,
      update: access.deny,
    },
    admin: { group: options.admin.group, hidden: true },
    fields: [
      { index: true, name: "provider", required: true, type: "text" },
      {
        index: true,
        name: "connectionKey",
        required: true,
        type: "text",
        unique: true,
      },
      { index: true, name: "category", required: true, type: "text" },
      { name: "displayName", required: true, type: "text" },
      {
        defaultValue: true,
        index: true,
        name: "enabled",
        required: true,
        type: "checkbox",
      },
      { defaultValue: {}, name: "configuration", required: true, type: "json" },
      { name: "credentialEnvelope", type: "textarea" },
      { name: "credentialUpdatedAt", type: "date" },
      {
        defaultValue: 1,
        min: 1,
        name: "revision",
        required: true,
        type: "number",
      },
      {
        defaultValue: "never",
        name: "lastTestStatus",
        options: ["never", "passed", "failed"],
        required: true,
        type: "select",
      },
      { name: "lastTestedAt", type: "date" },
      { name: "lastErrorCode", type: "text" },
      {
        name: "createdBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
      {
        name: "updatedBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
    ],
    timestamps: true,
    versions: false,
  };
};
