/**
 * @file src/collections/Media/MediaVariants.collection.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Хранит точные файлы вариантов и выдаёт их только для готового набора.
 * @see documentation/specifications/media-management.md
 */
import type { CollectionConfig } from "payload";
import {
  mediaProcessingInternalAccess,
  readReadyMediaVariant,
} from "./mediaFileAccess.policy";
import { mediaStoragePaths } from "./mediaStoragePaths.config";
import { protectStoredMediaFile } from "./protectStoredMediaFile.hook";

export const MediaVariants: CollectionConfig = {
  slug: "media-variants",
  labels: { singular: "Вариант изображения", plural: "Варианты изображений" },
  admin: { hidden: true, useAsTitle: "filename" },
  access: {
    create: mediaProcessingInternalAccess,
    read: readReadyMediaVariant,
    update: mediaProcessingInternalAccess,
    delete: mediaProcessingInternalAccess,
  },
  hooks: { beforeOperation: [protectStoredMediaFile] },
  fields: [
    {
      name: "set",
      type: "relationship",
      relationTo: "media-processing-sets",
      required: true,
      index: true,
    },
    {
      name: "variantKey",
      type: "text",
      required: true,
      unique: true,
      maxLength: 200,
    },
    { name: "slot", type: "text", required: true, maxLength: 48 },
    {
      name: "format",
      type: "select",
      required: true,
      options: ["webp", "jpeg", "png"],
    },
    {
      name: "contentHash",
      type: "text",
      required: true,
      minLength: 64,
      maxLength: 64,
    },
  ],
  upload: {
    staticDir: mediaStoragePaths.variants,
    mimeTypes: ["image/webp", "image/jpeg", "image/png"],
    crop: false,
    focalPoint: false,
    pasteURL: false,
    filesRequiredOnCreate: true,
    modifyResponseHeaders: ({ headers }) => {
      // Native ACL повторно проверяет ready-состояние при каждом запросе файла.
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      headers.set("X-Content-Type-Options", "nosniff");
      return headers;
    },
  },
};
