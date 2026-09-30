/**
 * @file packages/payload-ai-plugin/src/collections/DesignChanges.collection.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Сохраняет кандидата правки до apply с точной базой и сроком действия.
 * @see documentation/specifications/design-workshop.md
 */
import type { CollectionConfig } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { DESIGN_CHANGES_SLUG } from "../design-workshop/designWorkshop.constants";
import { createCollectionAccess } from "./access";

export function createDesignChangesCollection(
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig {
  const { deny } = createCollectionAccess();
  return {
    slug: DESIGN_CHANGES_SLUG,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: options.admin.group },
    versions: false,
    lockDocuments: false,
    timestamps: true,
    fields: [
      { name: "changeId", type: "text", required: true, unique: true },
      { name: "projectId", type: "text", required: true, index: true },
      { name: "baseRevisionId", type: "text", required: true },
      { name: "baseHash", type: "text", required: true },
      { name: "candidateHash", type: "text", required: true },
      { name: "candidate", type: "json", required: true },
      { name: "summary", type: "text", required: true },
      {
        name: "author",
        type: "relationship",
        relationTo: options.userCollection,
        required: true,
      },
      { name: "expiresAt", type: "date", required: true },
      { name: "appliedRevisionId", type: "text" },
    ],
  };
}
