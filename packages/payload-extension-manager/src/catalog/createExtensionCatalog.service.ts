/**
 * @file packages/payload-extension-manager/src/catalog/createExtensionCatalog.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Собирает bounded compiled каталог и hash metadata/host/runtime без installation.
 * @see documentation/specifications/extension-management.md
 */
import {
  isTemplateSettings,
  parseTemplateManifest,
  templateHostCompatibilitySchema,
} from "@realize/template-contracts";
import type {
  ExtensionCatalog,
  CreateExtensionCatalogInput,
} from "./ExtensionCatalog.types";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import { hashExtensionValue } from "../appearance/hashExtensionValue.server";

/** Перестановка registry не меняет hash; функции не сериализуются и не считаются artifact digest. */
export function createExtensionCatalog(
  input: CreateExtensionCatalogInput,
): ExtensionCatalog {
  try {
    const hostCompatibility = templateHostCompatibilitySchema.parse(
      input.hostCompatibility,
    );
    if (!Array.isArray(input.entries) || input.entries.length > 100)
      throw new ExtensionManagerError("INVALID_CATALOG");
    const runtimeBuildId = input.runtimeBuildId ?? null;
    if (
      runtimeBuildId !== null &&
      (typeof runtimeBuildId !== "string" ||
        !/^[A-Za-z0-9_-]{1,200}$/.test(runtimeBuildId))
    )
      throw new ExtensionManagerError("INVALID_CATALOG");
    const entries = input.entries
      .map((registration) => {
        const manifest = parseTemplateManifest(registration.manifest);
        if (
          !isTemplateSettings(registration.settingsSchema) ||
          typeof registration.resolveSettings !== "function" ||
          registration.settingsSchema.type !== "object"
        )
          throw new ExtensionManagerError("INVALID_CATALOG");
        return {
          manifest,
          settingsSchema: structuredClone(registration.settingsSchema),
          manifestHash: hashExtensionValue(manifest),
          resolveSettings: registration.resolveSettings,
        };
      })
      .sort((a, b) =>
        `${a.manifest.id}@${a.manifest.version}` <
        `${b.manifest.id}@${b.manifest.version}`
          ? -1
          : `${a.manifest.id}@${a.manifest.version}` >
              `${b.manifest.id}@${b.manifest.version}`
            ? 1
            : 0,
      );
    if (
      new Set(
        entries.map(
          (entry) => `${entry.manifest.id}@${entry.manifest.version}`,
        ),
      ).size !== entries.length
    )
      throw new ExtensionManagerError("INVALID_CATALOG");
    const catalogHash = hashExtensionValue({
      schemaVersion: "1.0",
      hostCompatibility,
      runtimeBuildId,
      entries: entries.map((entry) => ({
        manifest: entry.manifest,
        settingsSchema: entry.settingsSchema,
      })),
    });
    return {
      schemaVersion: "1.0",
      catalogHash,
      hostCompatibility,
      runtimeBuildId,
      entries,
    };
  } catch {
    throw new ExtensionManagerError("INVALID_CATALOG");
  }
}
