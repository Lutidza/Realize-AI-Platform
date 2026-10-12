/**
 * @file packages/payload-extension-manager/src/catalog/ExtensionCatalog.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Определяет compiled каталог и его публичную проекцию без React или Payload.
 * @see documentation/specifications/extension-management.md
 */
import type {
  TemplateHostCompatibility,
  TemplateManifest,
  TemplateSettings,
  TemplateTarget,
} from "@realize/template-contracts";

/** Registry предоставляет только доверенный compiled validator; никакого импорта из БД. */
export type ExtensionCatalogRegistration = {
  manifest: unknown;
  settingsSchema: unknown;
  resolveSettings: (input: TemplateSettings) => TemplateSettings;
};
export type ExtensionCatalogEntry = {
  manifest: TemplateManifest;
  manifestHash: string;
  settingsSchema: TemplateSettings;
  resolveSettings: (input: TemplateSettings) => TemplateSettings;
};
/** Hash связывает manifest/schema/host/runtime; не является digest установленного артефакта. */
export type ExtensionCatalog = {
  schemaVersion: "1.0";
  catalogHash: string;
  runtimeBuildId: string | null;
  hostCompatibility: TemplateHostCompatibility;
  entries: readonly ExtensionCatalogEntry[];
};
export type ExtensionCatalogEntryDto = {
  manifest: TemplateManifest;
  manifestHash: string;
  settingsSchema: TemplateSettings;
  availability: "compiled";
};
export type ExtensionCatalogDto = {
  schemaVersion: "1.0";
  catalogHash: string;
  runtimeBuildId: string | null;
  hostCompatibility: TemplateHostCompatibility;
  entries: ExtensionCatalogEntryDto[];
};

export type CreateExtensionCatalogInput = {
  entries: readonly ExtensionCatalogRegistration[];
  hostCompatibility: unknown;
  runtimeBuildId?: string | null;
};
export type ResolveExtensionAssignmentInput = {
  catalog: ExtensionCatalog;
  target: TemplateTarget;
  selection: unknown;
  settings: unknown;
};
