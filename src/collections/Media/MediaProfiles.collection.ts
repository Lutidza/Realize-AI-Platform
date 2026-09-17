/**
 * @file src/collections/Media/MediaProfiles.collection.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Настраивает штатную коллекцию и историю профилей обработки изображений.
 * @see documentation/specifications/media-management.md
 */

import type { CollectionConfig } from "payload";
import { adminOnly } from "@/access/adminOnly";
import { validateMediaProfile } from "./validateMediaProfile.hook";

export const MediaProfiles: CollectionConfig = {
  slug: "media-profiles",
  labels: { singular: "Профиль обработки", plural: "Профили обработки" },
  admin: {
    group: "Content",
    useAsTitle: "name",
    defaultColumns: ["name", "purpose", "enabled", "updatedAt"],
    description:
      "Размеры и форматы для новых заданий. Изменения не затрагивают готовые изображения.",
  },
  access: {
    create: adminOnly,
    read: adminOnly,
    readVersions: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  versions: { maxPerDoc: 100 },
  hooks: { beforeChange: [validateMediaProfile] },
  fields: [
    {
      name: "name",
      label: "Название",
      type: "text",
      required: true,
      maxLength: 160,
    },
    {
      name: "key",
      label: "Ключ",
      type: "text",
      required: true,
      unique: true,
      index: true,
      maxLength: 48,
      access: { update: () => false },
      admin: {
        description:
          "Латинские строчные буквы, цифры и дефис; первый символ — буква. После создания не меняется.",
      },
    },
    {
      name: "purpose",
      label: "Назначение",
      type: "select",
      required: true,
      defaultValue: "general",
      options: [
        { label: "Товары", value: "product" },
        { label: "Баннеры", value: "banner" },
        { label: "Логотипы", value: "logo" },
        { label: "Общее", value: "general" },
      ],
    },
    {
      name: "enabled",
      label: "Доступен для обработки",
      type: "checkbox",
      defaultValue: true,
    },
    {
      name: "description",
      label: "Описание",
      type: "textarea",
      maxLength: 2000,
    },
    {
      name: "variants",
      label: "Варианты",
      type: "array",
      required: true,
      minRows: 1,
      maxRows: 16,
      labels: { singular: "Вариант", plural: "Варианты" },
      fields: [
        {
          name: "slot",
          label: "Имя размера",
          type: "text",
          required: true,
          maxLength: 48,
          admin: {
            description:
              "Например: small, medium, large. Одинаковое имя в разных форматах требует одинаковой ширины.",
          },
        },
        {
          name: "width",
          label: "Ширина, px",
          type: "number",
          required: true,
          min: 1,
          max: 8192,
          admin: {
            description:
              "Пропорции сохраняются; маленький исходник не увеличивается.",
          },
        },
        {
          name: "format",
          label: "Формат",
          type: "select",
          required: true,
          defaultValue: "webp",
          options: [
            { label: "WebP", value: "webp" },
            { label: "JPEG", value: "jpeg" },
            { label: "PNG", value: "png" },
          ],
        },
        {
          name: "quality",
          label: "Качество",
          type: "number",
          min: 1,
          max: 100,
          defaultValue: 80,
          admin: {
            condition: (_, siblingData) => siblingData.format !== "png",
          },
        },
        {
          name: "compressionLevel",
          label: "Сжатие PNG",
          type: "number",
          min: 0,
          max: 9,
          defaultValue: 6,
          admin: {
            condition: (_, siblingData) => siblingData.format === "png",
            description:
              "От 0 до 9, по умолчанию 6. Сжатие без потери качества.",
          },
        },
      ],
    },
  ],
};
