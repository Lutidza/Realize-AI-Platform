/**
 * @file packages/payload-ai-plugin/src/collections/DesignProjects.collection.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Хранит владельца дизайн-проекта и единственный указатель его текущей версии.
 * @see documentation/specifications/design-workshop.md
 */
import type { CollectionConfig } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { DESIGN_PROJECTS_SLUG } from "../design-workshop/designWorkshop.constants";
import { createCollectionAccess } from "./access";

export function createDesignProjectsCollection(
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig {
  const { deny } = createCollectionAccess();
  return {
    slug: DESIGN_PROJECTS_SLUG,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true, group: options.admin.group },
    versions: false,
    lockDocuments: false,
    timestamps: true,
    fields: [
      { name: "projectId", type: "text", required: true, unique: true },
      { name: "bindingId", type: "text", required: true, unique: true },
      {
        name: "owner",
        type: "relationship",
        relationTo: options.userCollection,
        required: true,
        index: true,
      },
      { name: "title", type: "text", required: true },
      {
        name: "target",
        type: "select",
        options: ["admin", "frontend", "shared"],
        required: true,
      },
      {
        name: "kind",
        type: "select",
        options: ["reference", "interface", "component", "module", "theme"],
        required: true,
      },
      { name: "currentRevisionId", type: "text", required: true },
      { name: "currentRevisionNumber", type: "number", required: true, min: 1 },
      { name: "currentHash", type: "text", required: true },
    ],
  };
}
