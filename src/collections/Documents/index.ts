/**
 * @file src/collections/Documents/index.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Определяет закрытую коллекцию административных документов с упорядоченными разделами.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access/adminOnly";
import {
  validateDocumentIdentifier,
  validateDocumentParagraph,
  validateDocumentSections,
  validateDocumentTitle,
} from "./documentValidation.validators";

export const Documents: CollectionConfig = {
  slug: "documents",
  labels: { singular: "Документ", plural: "Документы" },
  access: {
    create: adminOnly,
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    useAsTitle: "title",
    group: "Content",
    defaultColumns: ["title", "slug", "updatedAt"],
  },
  timestamps: true,
  fields: [
    {
      name: "title",
      label: "Заголовок",
      type: "text",
      required: true,
      maxLength: 160,
      validate: validateDocumentTitle,
    },
    {
      name: "description",
      label: "Описание",
      type: "textarea",
      maxLength: 1000,
    },
    {
      name: "slug",
      label: "Адрес документа",
      type: "text",
      required: true,
      unique: true,
      index: true,
      maxLength: 128,
      validate: validateDocumentIdentifier,
    },
    {
      name: "sections",
      label: "Разделы",
      type: "array",
      required: true,
      minRows: 1,
      validate: validateDocumentSections,
      fields: [
        {
          name: "anchor",
          label: "Anchor раздела",
          type: "text",
          required: true,
          maxLength: 128,
          validate: validateDocumentIdentifier,
        },
        {
          name: "title",
          label: "Заголовок раздела",
          type: "text",
          required: true,
          maxLength: 160,
          validate: validateDocumentTitle,
        },
        {
          name: "paragraphs",
          label: "Абзацы",
          type: "array",
          required: true,
          minRows: 1,
          fields: [
            {
              name: "text",
              label: "Текст",
              type: "textarea",
              required: true,
              validate: validateDocumentParagraph,
            },
          ],
        },
      ],
    },
  ],
};
