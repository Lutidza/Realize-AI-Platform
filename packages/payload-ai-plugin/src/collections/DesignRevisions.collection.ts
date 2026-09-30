/**
 * @file packages/payload-ai-plugin/src/collections/DesignRevisions.collection.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Хранит immutable snapshots дизайна без native mutable drafts.
 * @see documentation/specifications/design-workshop.md
 */
import type { CollectionConfig } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { DESIGN_REVISIONS_SLUG } from "../design-workshop/designWorkshop.constants";
import { createCollectionAccess } from "./access";

export function createDesignRevisionsCollection(
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig {
  const { deny } = createCollectionAccess();
  return {
    slug: DESIGN_REVISIONS_SLUG,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: options.admin.group },
    versions: false,
    lockDocuments: false,
    timestamps: true,
    indexes: [{ fields: ["projectId", "number"], unique: true }],
    fields: [
      { name: "revisionId", type: "text", required: true, unique: true },
      { name: "projectId", type: "text", required: true, index: true },
      { name: "parentRevisionId", type: "text" },
      { name: "number", type: "number", required: true, min: 1 },
      { name: "contentHash", type: "text", required: true },
      { name: "snapshot", type: "json", required: true },
      {
        name: "author",
        type: "relationship",
        relationTo: options.userCollection,
        required: true,
      },
      {
        name: "channel",
        type: "select",
        options: ["admin", "mcp"],
        required: true,
      },
    ],
  };
}
