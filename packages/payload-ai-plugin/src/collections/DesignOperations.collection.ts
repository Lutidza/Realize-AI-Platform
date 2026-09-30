/**
 * @file packages/payload-ai-plugin/src/collections/DesignOperations.collection.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Фиксирует успешные операции и bounded receipts в той же транзакции, что и snapshot.
 * @see documentation/specifications/design-workshop.md
 */
import type { CollectionConfig } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { DESIGN_OPERATIONS_SLUG } from "../design-workshop/designWorkshop.constants";
import { createCollectionAccess } from "./access";

export function createDesignOperationsCollection(
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig {
  const { deny } = createCollectionAccess();
  return {
    slug: DESIGN_OPERATIONS_SLUG,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: options.admin.group },
    versions: false,
    lockDocuments: false,
    timestamps: true,
    fields: [
      { name: "operationId", type: "text", required: true, unique: true },
      { name: "replayKey", type: "text", required: true, unique: true },
      { name: "requestHash", type: "text", required: true },
      {
        name: "actor",
        type: "relationship",
        relationTo: options.userCollection,
        required: true,
      },
      { name: "projectId", type: "text", required: true, index: true },
      { name: "receipt", type: "json", required: true },
    ],
  };
}
