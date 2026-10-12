/**
 * @file packages/payload-extension-manager/src/catalog/mapExtensionCatalog.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Выдаёт только schema-checked metadata compiled каталога без callbacks.
 * @see documentation/specifications/extension-management.md
 */
import type {
  ExtensionCatalog,
  ExtensionCatalogDto,
} from "./ExtensionCatalog.types";

/** Manifest — strict SDK DTO; JSON schema проверена при сборке, resolveSettings не пересекает boundary. */
export function mapExtensionCatalog(
  catalog: ExtensionCatalog,
): ExtensionCatalogDto {
  return {
    schemaVersion: "1.0",
    catalogHash: catalog.catalogHash,
    runtimeBuildId: catalog.runtimeBuildId,
    hostCompatibility: structuredClone(catalog.hostCompatibility),
    entries: catalog.entries.map((entry) => ({
      manifest: structuredClone(entry.manifest),
      manifestHash: entry.manifestHash,
      settingsSchema: structuredClone(entry.settingsSchema),
      availability: "compiled",
    })),
  };
}
