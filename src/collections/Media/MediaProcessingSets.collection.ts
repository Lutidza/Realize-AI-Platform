/**
 * @file src/collections/Media/MediaProcessingSets.collection.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Хранит неизменяемый рецепт и состояние native фоновой обработки Media.
 * @see documentation/specifications/media-management.md
 */
import { APIError, type CollectionConfig } from "payload";
import { adminOnly } from "@/access/adminOnly";

export const MediaProcessingSets: CollectionConfig = {
  slug: "media-processing-sets",
  admin: { hidden: true },
  access: {
    read: adminOnly,
    create: ({ req }) => req.context.mediaProcessingInternal === true,
    update: ({ req }) => req.context.mediaProcessingInternal === true,
    delete: ({ req }) => req.context.mediaProcessingInternal === true,
  },
  hooks: {
    beforeOperation: [
      ({ args, operation, req }) => {
        if (
          ["create", "update", "delete"].includes(operation) &&
          req.context.mediaProcessingInternal !== true
        ) {
          throw new APIError("Набором управляет сервис обработки Media.", 403);
        }
        if (
          operation === "update" &&
          "data" in args &&
          args.data &&
          Object.keys(args.data).some(
            (key) =>
              ![
                "status",
                "job",
                "error",
                "resultHash",
                "manualRetries",
              ].includes(key),
          )
        ) {
          throw new APIError(
            "Источник и рецепт сохранённого набора неизменяемы.",
            409,
          );
        }
        return args;
      },
    ],
  },
  fields: [
    {
      name: "media",
      type: "relationship",
      relationTo: "media",
      // Backlink может быть null внутри native удаления; новый набор всегда связан с Media.
      validate: (value: unknown, { operation }: { operation?: string }) =>
        operation !== "create" ||
        (typeof value === "number" && value > 0) ||
        "Необходим исходный Media.",
      index: true,
    },
    {
      name: "original",
      type: "relationship",
      relationTo: "media-originals",
      required: true,
    },
    {
      name: "profile",
      type: "relationship",
      relationTo: "media-profiles",
      required: true,
    },
    { name: "profileName", type: "text", required: true },
    { name: "profileVersion", type: "number", required: true },
    { name: "recipe", type: "json", required: true },
    { name: "sourceHash", type: "text", required: true },
    { name: "recipeHash", type: "text", required: true },
    { name: "pipelineVersion", type: "text", required: true },
    { name: "requestKey", type: "text", required: true, unique: true },
    {
      name: "requestedBy",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "queued",
      options: ["queued", "processing", "ready", "failed"],
    },
    { name: "job", type: "relationship", relationTo: "payload-jobs" },
    { name: "error", type: "text" },
    { name: "resultHash", type: "text" },
    { name: "manualRetries", type: "number", defaultValue: 0, required: true },
  ],
};
