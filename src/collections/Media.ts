/**
 * @file src/collections/Media.ts
 * @version 1.2.1
 * @date 2026-09-16
 * @description Настраивает штатную Media collection, рабочую библиотеку и макеты следующих разделов.
 * @see documentation/specifications/media-management.md
 */
import type { CollectionConfig } from "payload";

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";
import path from "path";

import { adminOnly } from "@/access/adminOnly";
import { checkRole } from "@/access/utilities";
import { prepareMediaUpload } from "./Media/prepareMediaUpload.hook";
import { archiveAndQueueMedia } from "./Media/archiveAndQueueMedia.hook";
import { mediaProcessingEndpoints } from "./Media/mediaProcessing.endpoints";
import { assertMediaDeletionReady } from "./Media/assertMediaDeletionReady.hook";
import { deleteMediaProcessing } from "./Media/deleteMediaProcessing.hook";

export const Media: CollectionConfig = {
  admin: {
    group: "Content",
    listSearchableFields: ["filename", "alt"],
    defaultColumns: ["filename", "alt", "mimeType", "filesize", "updatedAt"],
    pagination: { defaultLimit: 12, limits: [12, 24, 48] },
    description:
      "Изображения и файлы сайта. Ищите по имени файла или альтернативному тексту; откройте материал для редактирования.",
    components: {
      afterList: [
        "/src/components/admin/media/MediaReferenceEntry.component#MediaReferenceEntry",
      ],
      views: {
        list: {
          Component:
            "/src/components/admin/media/MediaListView.component#MediaListView",
        },
        reference: {
          Component:
            "/src/components/admin/media/MediaReferenceView.view#MediaReferenceView",
          path: "/reference",
          exact: true,
        },
      },
    },
  },
  slug: "media",
  labels: { singular: "Медиафайл", plural: "Медиатека" },
  defaultSort: "-createdAt",
  forceSelect: { original: true },
  endpoints: mediaProcessingEndpoints,
  hooks: {
    beforeOperation: [prepareMediaUpload],
    afterChange: [archiveAndQueueMedia],
    beforeDelete: [assertMediaDeletionReady],
    afterDelete: [deleteMediaProcessing],
  },
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: () => true,
    update: adminOnly,
  },
  fields: [
    {
      name: "processingProfile",
      label: "Профиль обработки",
      type: "relationship",
      relationTo: "media-profiles",
      filterOptions: { enabled: { equals: true } },
      access: { read: ({ req }) => checkRole(["admin"], req.user) },
      admin: {
        description:
          "Для JPEG, PNG и WebP. При выборе нового профиля и сохранении варианты создаются в фоне. Без профиля сохраняются исходник и копия для сайта.",
      },
    },
    {
      name: "alt",
      label: "Альтернативный текст",
      type: "text",
      required: true,
    },
    {
      name: "caption",
      label: "Подпись",
      type: "richText",
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [
            ...rootFeatures,
            FixedToolbarFeature(),
            InlineToolbarFeature(),
          ];
        },
      }),
    },
    {
      name: "processing",
      type: "ui",
      admin: {
        components: {
          Field:
            "/src/components/admin/media/MediaProcessingField.component#MediaProcessingField",
        },
      },
    },
    {
      name: "original",
      type: "relationship",
      relationTo: "media-originals",
      admin: { hidden: true },
      access: { read: ({ req }) => checkRole(["admin"], req.user) },
    },
    { name: "managedDisplay", type: "checkbox", admin: { hidden: true } },
    // Существующие значения сохраняются; новые источники не редактируются crop/focal.
    { name: "focalX", type: "number", admin: { hidden: true } },
    { name: "focalY", type: "number", admin: { hidden: true } },
  ],
  upload: {
    // Standalone устанавливает cwd своего runtime-каталога до загрузки Payload.
    staticDir: path.resolve(process.cwd(), "public/media"),
    crop: false,
    focalPoint: false,
  },
};
