/**
 * @file packages/payload-extension-manager/src/catalog/ExtensionCatalog.types.ts
 * @version 1.2.0
 * @date 2026-11-18
 * @description Определяет compiled каталог и его публичную проекцию без React или Payload.
 * @see documentation/specifications/extension-management.md
 */
import type {
  TemplateHostCompatibility,
  TemplateManifest,
  TemplateSettings,
  TemplateTarget,
  TemplateLayoutCatalog,
} from "@realize/template-contracts";

/** Host admission policy; отсутствие сохраняет прежнее разрешение рабочего использования. */
export type ExtensionTemplateReadiness = "ready" | "preview-only";

/** Registry предоставляет только доверенный compiled validator; никакого импорта из БД. */
export type ExtensionCatalogRegistration = {
  /** Явное host mapping native release к global identity; отсутствие сохраняет legacy profile. */
  layouts?: { templateIdentity: unknown; catalog: unknown };
  readiness?: ExtensionTemplateReadiness;
  manifest: unknown;
  settingsSchema: unknown;
  resolveSettings: (input: TemplateSettings) => TemplateSettings;
};
export type ExtensionCatalogEntry = {
  layoutCatalog?: TemplateLayoutCatalog;
  readiness?: ExtensionTemplateReadiness;
  manifest: TemplateManifest;
  manifestHash: string;
  settingsSchema: TemplateSettings;
  resolveSettings: (input: TemplateSettings) => TemplateSettings;
};
/** Hash связывает manifest/schema/host/runtime/admission; не является digest установленного артефакта. */
export type ExtensionCatalog = {
  schemaVersion: "1.0";
  catalogHash: string;
  runtimeBuildId: string | null;
  hostCompatibility: TemplateHostCompatibility;
  entries: readonly ExtensionCatalogEntry[];
};
export type ExtensionCatalogEntryDto = {
  layoutCatalog?: TemplateLayoutCatalog;
  readiness?: ExtensionTemplateReadiness;
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
