/**
 * @file src/payload.config.ts
 * @version 1.1.0
 * @date 2026-09-15
 * @description Настраивает активную схему Payload, PostgreSQL и native обработку Media.
 * @see documentation/specifications/media-management.md
 */

import { postgresAdapter } from "@payloadcms/db-postgres";

import {
  BoldFeature,
  EXPERIMENTAL_TableFeature,
  IndentFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  UnderlineFeature,
  UnorderedListFeature,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";

import { Categories } from "@/collections/Categories";
import { Media } from "@/collections/Media";
import { MediaProfiles } from "@/collections/Media/MediaProfiles.collection";
import { MediaOriginals } from "@/collections/Media/MediaOriginals.collection";
import { MediaVariants } from "@/collections/Media/MediaVariants.collection";
import { MediaProcessingSets } from "@/collections/Media/MediaProcessingSets.collection";
import { processMediaTask } from "@/collections/Media/processMedia.task";
import { Pages } from "@/collections/Pages";
import { Users } from "@/collections/Users";
import { Footer } from "@/globals/Footer";
import { Header } from "@/globals/Header";
import { plugins } from "./plugins";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const serverURL =
  process.env.PAYLOAD_PUBLIC_SITE_URL ||
  process.env.PAYLOAD_PUBLIC_SERVER_URL ||
  process.env.NEXT_PUBLIC_SERVER_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";
// Versioned databases stay migration-only; schema push is opt-in for disposable local databases.
const shouldPushDevelopmentSchema =
  process.env.NODE_ENV !== "production" &&
  process.env.PAYLOAD_DB_PUSH === "true";

export default buildConfig({
  admin: {
    user: Users.slug,
  },
  collections: [
    Users,
    Pages,
    Categories,
    Media,
    MediaProfiles,
    MediaOriginals,
    MediaProcessingSets,
    MediaVariants,
  ],
  jobs: {
    tasks: [processMediaTask],
    autoRun: [],
    deleteJobOnComplete: false,
    access: { run: () => false, queue: () => false, cancel: () => false },
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      admin: { ...defaultJobsCollection.admin, hidden: true },
      access: {
        ...defaultJobsCollection.access,
        create: () => false,
        update: () => false,
        delete: () => false,
      },
      fields: defaultJobsCollection.fields.some(
        (field) => "name" in field && field.name === "meta",
      )
        ? defaultJobsCollection.fields
        : [...defaultJobsCollection.fields, { name: "meta", type: "json" }],
    }),
  },
  db: postgresAdapter({
    migrationDir: path.resolve(dirname, "migrations"),
    pool: {
      connectionString:
        process.env.DATABASE_URI || process.env.DATABASE_URL || "",
    },
    push: shouldPushDevelopmentSchema,
  }),
  editor: lexicalEditor({
    features: () => {
      return [
        UnderlineFeature(),
        BoldFeature(),
        ItalicFeature(),
        OrderedListFeature(),
        UnorderedListFeature(),
        LinkFeature({
          enabledCollections: ["pages"],
          fields: ({ defaultFields }) => {
            const defaultFieldsWithoutUrl = defaultFields.filter((field) => {
              if ("name" in field && field.name === "url") return false;
              return true;
            });

            return [
              ...defaultFieldsWithoutUrl,
              {
                name: "url",
                type: "text",
                admin: {
                  condition: ({ linkType }) => linkType !== "internal",
                },
                label: ({ t }) => t("fields:enterURL"),
                required: true,
              },
            ];
          },
        }),
        IndentFeature(),
        EXPERIMENTAL_TableFeature(),
      ];
    },
  }),
  //email: nodemailerAdapter(),
  endpoints: [],
  globals: [Header, Footer],
  plugins,
  secret: process.env.PAYLOAD_SECRET || "",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  serverURL,
});
