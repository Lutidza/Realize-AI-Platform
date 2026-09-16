/**
 * @file src/collections/Media/MediaOriginals.collection.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Хранит приватные неизменяемые исходники, связанные с рабочей Media.
 * @see documentation/specifications/media-management.md
 */
import type { CollectionConfig } from "payload";
import {
  mediaProcessingInternalAccess,
  readMediaOriginal,
} from "./mediaFileAccess.policy";
import { mediaStoragePaths } from "./mediaStoragePaths.config";
import { protectStoredMediaFile } from "./protectStoredMediaFile.hook";

export const MediaOriginals: CollectionConfig = {
  slug: "media-originals",
  labels: { singular: "Исходник", plural: "Исходники" },
  admin: { hidden: true, useAsTitle: "filename" },
  access: {
    create: mediaProcessingInternalAccess,
    read: readMediaOriginal,
    update: mediaProcessingInternalAccess,
    delete: mediaProcessingInternalAccess,
  },
  hooks: { beforeOperation: [protectStoredMediaFile] },
  fields: [
    {
      name: "media",
      type: "relationship",
      relationTo: "media",
      // Native DELETE временно обнуляет backlink до afterDelete cleanup в той же транзакции.
      validate: (value: unknown, { operation }: { operation?: string }) =>
        operation !== "create" ||
        (typeof value === "number" && value > 0) ||
        "Необходим исходный Media.",
      index: true,
    },
    {
      name: "sourceHash",
      type: "text",
      required: true,
      index: true,
      minLength: 64,
      maxLength: 64,
    },
    {
      name: "provenance",
      type: "select",
      required: true,
      options: ["uploaded", "legacy-copy"],
    },
    { name: "alt", type: "text" },
  ],
  upload: {
    staticDir: mediaStoragePaths.originals,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    crop: false,
    focalPoint: false,
    pasteURL: false,
    filesRequiredOnCreate: true,
    modifyResponseHeaders: ({ headers }) => {
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      return headers;
    },
  },
};
