/**
 * @file packages/payload-extension-manager/src/extensionManagerCollections.config.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Определяет закрытые state и immutable receipt collections appearance.
 * @see documentation/specifications/extension-management.md
 */

import type { CollectionConfig } from "payload";
import { ExtensionAppearanceStorageError } from "./persistence/ExtensionAppearanceStorage.error";
import {
  EXTENSION_MANAGER_STATE_SLUG,
  EXTENSION_MANAGER_RECEIPTS_SLUG,
  EXTENSION_MANAGER_STATE_TABLE,
  EXTENSION_MANAGER_RECEIPTS_TABLE,
} from "./persistence/extensionAppearancePersistence.constants";

const deny = () => false;

/** Встроенный CRUD закрыт; только ACL-checked facade использует Local API overrideAccess. */
export function createExtensionManagerCollections(): CollectionConfig[] {
  return [
    {
      slug: EXTENSION_MANAGER_STATE_SLUG,
      dbName: EXTENSION_MANAGER_STATE_TABLE,
      admin: { hidden: true },
      access: { create: deny, read: deny, update: deny, delete: deny },
      lockDocuments: false,
      fields: [
        { name: "scopeKey", type: "text", required: true, unique: true },
        { name: "state", type: "json", required: true },
      ],
      timestamps: true,
      versions: false,
    },
    {
      slug: EXTENSION_MANAGER_RECEIPTS_SLUG,
      dbName: EXTENSION_MANAGER_RECEIPTS_TABLE,
      admin: { hidden: true },
      access: { create: deny, read: deny, update: deny, delete: deny },
      lockDocuments: false,
      hooks: {
        beforeChange: [
          ({ operation }) => {
            if (operation !== "create")
              throw new ExtensionAppearanceStorageError("IMMUTABLE_RECEIPT");
          },
        ],
        beforeDelete: [
          () => {
            throw new ExtensionAppearanceStorageError("IMMUTABLE_RECEIPT");
          },
        ],
      },
      fields: [
        { name: "replayKey", type: "text", required: true, unique: true },
        { name: "scopeKey", type: "text", required: true, index: true },
        {
          name: "kind",
          type: "select",
          required: true,
          index: true,
          options: ["prepare", "apply"],
        },
        { name: "record", type: "json", required: true },
      ],
      timestamps: true,
      versions: false,
    },
  ];
}
