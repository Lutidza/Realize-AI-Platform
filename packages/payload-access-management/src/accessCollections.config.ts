/**
 * @file packages/payload-access-management/src/accessCollections.config.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Закрывает credential storage от CRUD, GraphQL и недоверенного Local API.
 * @see documentation/architecture/platform-access.md
 */
import type { CollectionConfig, Field } from "payload";
import {
  ACCESS_CREDENTIALS_SLUG,
  ACCESS_DEVICES_SLUG,
  ACCESS_LIMITS_SLUG,
  ACCESS_REFRESH_HISTORY_SLUG,
  ACCESS_STORAGE_CONTEXT,
} from "./accessManagement.constants";
const text = (name: string, unique = false): Field => ({
  name,
  type: "text",
  required: true,
  index: true,
  unique,
});
const json = (name: string): Field => ({ name, type: "json", required: true });
const date = (name: string): Field => ({
  name,
  type: "date",
  required: true,
  index: true,
});
const deny = () => false;
/** Service context — private Symbol, а overrideAccess сам по себе не открывает секретные hashes. */
export function createAccessCollections(): CollectionConfig[] {
  const definitions: Array<{ slug: string; fields: Field[] }> = [
    {
      slug: ACCESS_CREDENTIALS_SLUG,
      fields: [
        text("credentialId", true),
        text("ownerId"),
        date("expiresAt"),
        json("record"),
      ],
    },
    {
      slug: ACCESS_DEVICES_SLUG,
      fields: [
        text("deviceId", true),
        text("userCode", true),
        date("expiresAt"),
        json("record"),
      ],
    },
    {
      slug: ACCESS_LIMITS_SLUG,
      fields: [
        text("bucket", true),
        date("windowStart"),
        { name: "count", type: "number", required: true, min: 0 },
      ],
    },
    {
      slug: ACCESS_REFRESH_HISTORY_SLUG,
      fields: [
        text("refreshHash", true),
        text("credentialId"),
        date("expiresAt"),
      ],
    },
  ];
  return definitions.map(({ slug, fields }) => ({
    slug,
    fields,
    access: { create: deny, read: deny, update: deny, delete: deny },
    admin: { hidden: true },
    graphQL: false,
    versions: false,
    lockDocuments: false,
    timestamps: true,
    hooks: {
      beforeOperation: [
        ({ context }) => {
          if (
            (context as Record<symbol, unknown>)[ACCESS_STORAGE_CONTEXT] !==
            true
          )
            throw new Error("ACCESS_STORAGE_PRIVATE");
        },
      ],
    },
  }));
}
