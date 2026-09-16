/**
 * @file tests/int/support/mediaArchitecture/mediaArchitecture.config.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Собирает изолированную upload/Jobs схему без импорта конфигурации приложения.
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  buildConfig,
  type Access,
  type CollectionConfig,
  type TextField,
} from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import pg from "pg";
import { protectMediaOriginal } from "../../../../src/collections/Media/protectMediaOriginal.hook";
import { createMediaArchitectureTask } from "./createMediaArchitectureTask.task";
import type { MediaArchitectureConfigOptions } from "./MediaArchitecture.types";
import { createMediaArchitecturePool } from "./createMediaArchitecturePool.adapter";

const authenticated: Access = ({ req }) => Boolean(req.user);
const recordAccess = {
  create: authenticated,
  read: authenticated,
  update: authenticated,
  delete: () => false,
};
const text = (name: string): TextField => ({
  name,
  type: "text",
  required: true,
});

/** push и generators выключены; migrationDir/storageRoot принадлежат только proof. */
export const buildMediaArchitectureConfig = ({
  connectionString,
  storageRoot,
  migrationDir,
}: MediaArchitectureConfigOptions) => {
  const collections: CollectionConfig[] = [
    { slug: "users", auth: true, access: recordAccess, fields: [] },
    {
      slug: "proof-originals",
      access: recordAccess,
      hooks: { beforeOperation: [protectMediaOriginal] },
      fields: [text("alt")],
      upload: {
        staticDir: path.join(storageRoot, "originals"),
        mimeTypes: ["image/jpeg", "image/png"],
        crop: false,
        focalPoint: false,
        modifyResponseHeaders: ({ headers }) => {
          headers.set("Cache-Control", "private, no-store");
          return headers;
        },
      },
    },
    {
      slug: "proof-variants",
      access: { ...recordAccess, read: () => true, update: () => false },
      hooks: { beforeOperation: [protectMediaOriginal] },
      fields: [
        { name: "resultKey", type: "text", required: true, unique: true },
        ...[
          "variantSetID",
          "sourceHash",
          "recipeHash",
          "pipelineVersion",
          "slot",
          "format",
          "contentHash",
        ].map(text),
      ],
      upload: {
        staticDir: path.join(storageRoot, "variants"),
        mimeTypes: ["image/webp", "image/jpeg", "image/png"],
        crop: false,
        focalPoint: false,
      },
    },
    {
      slug: "proof-intents",
      access: recordAccess,
      fields: [
        {
          name: "originalID",
          type: "number",
          required: true,
          access: { update: () => false },
        },
        { ...text("sourceHash"), access: { update: () => false } },
        {
          name: "recipe",
          type: "json",
          required: true,
          access: { update: () => false },
        },
        {
          name: "status",
          type: "select",
          options: ["pending", "ready"],
          defaultValue: "pending",
          required: true,
        },
        { name: "variantSetID", type: "text" },
        { name: "failOnce", type: "checkbox", defaultValue: false },
        { name: "failedOnce", type: "checkbox", defaultValue: false },
      ],
    },
  ];
  return buildConfig({
    secret: randomBytes(32).toString("hex"),
    serverURL: "http://media-proof.invalid",
    admin: { user: "users", importMap: { autoGenerate: false } },
    typescript: { autoGenerate: false },
    graphQL: { disable: true },
    // Sharp принадлежит сервису: Payload 3.88 иначе перекодирует каждый WebP,
    // даже когда imageSizes/formatOptions не заданы.
    telemetry: false,
    logger: { options: { level: "silent" } },
    collections,
    db: postgresAdapter({
      pg: { ...pg, Pool: createMediaArchitecturePool() },
      pool: { connectionString },
      push: false,
      disableCreateDatabase: true,
      migrationDir,
    }),
    jobs: {
      autoRun: [],
      access: {
        queue: ({ req }) => Boolean(req.user),
        run: ({ req }) => Boolean(req.user),
      },
      tasks: [createMediaArchitectureTask(storageRoot)],
    },
  });
};
