/**
 * @file packages/payload-ai-plugin/src/collections/workerPresence.collection.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Описывает закрытую runtime-коллекцию heartbeat отдельных экземпляров исполнителя.
 */

import type { CollectionConfig } from "payload";
import { WORKER_PRESENCE_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";

/** Только процесс исполнителя пишет через SQL; браузер получает allowlisted диагностику. */
export const createWorkerPresenceCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => {
  const { deny } = createCollectionAccess();
  return {
    slug: WORKER_PRESENCE_SLUG,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { group: options.admin.group, hidden: true },
    lockDocuments: false,
    fields: [
      { name: "instanceKey", type: "text", required: true, unique: true },
      {
        name: "state",
        type: "select",
        required: true,
        options: ["idle", "busy", "draining", "stopped", "error"],
      },
      { name: "lastSeenAt", type: "date", required: true, index: true },
      { name: "capabilities", type: "json", required: true },
      {
        name: "currentKind",
        type: "select",
        options: ["execution", "preview", "sourcePromotion", "release"],
      },
      { name: "currentChangeRequest", type: "text" },
    ],
    timestamps: true,
    versions: false,
  };
};
