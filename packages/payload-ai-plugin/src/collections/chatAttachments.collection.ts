/**
 * @file packages/payload-ai-plugin/src/collections/chatAttachments.collection.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Хранит закрытые метаданные вложений; бинарные файлы принадлежат control plane.
 */
import type { CollectionConfig } from "payload";
import { CHAT_ATTACHMENTS_SLUG } from "../constants";
import type { SanitizedRealizeAIPluginOptions } from "../types";

/** Raw collection API закрыт: доступ владельца проверяют только chat endpoints. */
export const createChatAttachmentsCollection = (
  options: SanitizedRealizeAIPluginOptions,
): CollectionConfig => ({
  slug: CHAT_ATTACHMENTS_SLUG,
  access: {
    create: () => false,
    read: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: { group: options.admin.group, hidden: true },
  fields: [
    {
      name: "assetID",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: options.userCollection,
      required: true,
      index: true,
    },
    { name: "name", type: "text", required: true },
    { name: "mimeType", type: "text", required: true },
    { name: "size", type: "number", required: true, min: 1 },
    {
      name: "kind",
      type: "select",
      options: ["image", "text"],
      required: true,
    },
    { name: "sha256", type: "text", required: true },
    { name: "expiresAt", type: "date", required: true, index: true },
    { name: "runID", type: "text", index: true },
  ],
  timestamps: true,
  versions: false,
});
