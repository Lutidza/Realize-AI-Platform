/**
 * @file packages/payload-ai-plugin/src/collections/SearchObservationState.collection.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Хранит закрытое ограниченное состояние управления диагностикой установки.
 * @see documentation/architecture/repository-search.md
 */
import type { CollectionConfig } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { createCollectionAccess } from "./access";
import {
  SEARCH_OBSERVATION_INITIAL_STATE,
  SEARCH_OBSERVATION_STATE_SLUG,
} from "../search-observability/searchObservation.config";

export function createSearchObservationStateCollection(
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig {
  const { deny } = createCollectionAccess();
  return {
    slug: SEARCH_OBSERVATION_STATE_SLUG,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: options.admin.group },
    timestamps: true,
    versions: false,
    fields: [
      { name: "singletonKey", type: "text", required: true, unique: true },
      // Публичного JSON editor нет: запись проходит strict schema, CAS и общий transaction lock.
      {
        name: "state",
        type: "json",
        required: true,
        defaultValue: SEARCH_OBSERVATION_INITIAL_STATE,
      },
    ],
  };
}
