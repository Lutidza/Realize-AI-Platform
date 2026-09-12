/**
 * @file packages/payload-ai-plugin/src/collections/runs.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Хранит проверяемый снимок запроса и состояние read-only запуска.
 */

import type { CollectionConfig, CollectionSlug } from "payload";

import { CONVERSATIONS_SLUG, RUNS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

export const createRunsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const access = createCollectionAccess();

  return {
    slug: RUNS_SLUG,
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
        defaultValue: "openai-codex",
        name: "provider",
        required: true,
        type: "text",
      },
      { name: "model", type: "text" },
      { name: "requestHash", type: "text" },
      { name: "turnContext", type: "json" },
      { index: true, name: "threadID", type: "text" },
      {
        defaultValue: "queued",
        index: true,
        name: "status",
        options: ["queued", "running", "completed", "failed", "cancelled"],
        required: true,
        type: "select",
      },
      {
        defaultValue: "analysis-readonly",
        name: "sandboxProfile",
        required: true,
        type: "text",
      },
      { name: "startedAt", type: "date" },
      { name: "finishedAt", type: "date" },
      { name: "usage", type: "json" },
      { name: "errorSummary", type: "textarea" },
      {
        defaultValue: 0,
        min: 0,
        name: "eventCursor",
        required: true,
        type: "number",
      },
      {
        index: true,
        name: "idempotencyKey",
        required: true,
        type: "text",
        unique: true,
      },
      {
        name: "requestedBy",
        relationTo: options.userCollection,
        required: true,
        type: "relationship",
      },
    ],
    timestamps: true,
    versions: false,
  };
};
