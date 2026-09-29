/**
 * @file packages/payload-ai-plugin/src/collections/SearchObservations.collection.ts
 * @version 1.0.0
 * @date 2026-09-27
 * @description Объявляет закрытое временное хранилище диагностики поиска.
 * @see documentation/architecture/repository-search.md
 */
import type { CollectionConfig } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";
import { SEARCH_OBSERVATION_SLUG } from "../search-observability/searchObservation.config";

export function createSearchObservationsCollection(
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig {
  const { deny } = createCollectionAccess();
  return {
    slug: SEARCH_OBSERVATION_SLUG,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: options.admin.group },
    timestamps: true,
    versions: false,
    fields: [
      { name: "storageKey", type: "text", required: true, unique: true },
      { name: "origin", type: "text", required: true },
      { name: "source", type: "text", required: true, index: true },
      { name: "outcome", type: "text", required: true, index: true },
      { name: "observedAt", type: "date", required: true, index: true },
      { name: "durationMs", type: "number", required: true },
      { name: "event", type: "json", required: true },
    ],
  };
}
