/**
 * @file src/plugins/extensionTemplateCatalog.config.ts
 * @version 1.1.0
 * @date 2026-11-18
 * @description Регистрирует server-safe metadata и валидаторы compiled шаблонов текущего host.
 * @see documentation/specifications/extension-management.md
 */
import type { ExtensionCatalogRegistration } from "@realize/payload-extension-manager/contracts";
import { realizeTemplateManifest } from "@realize/template-realize/manifest";
import realizeSettingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import { controlPanelManifest } from "@realize/template-realizeai-control-panel/manifest";
import controlPanelSettingsSchema from "@realize/template-realizeai-control-panel/settings.schema.json";
import { resolveControlPanelSettings } from "@realize/template-realizeai-control-panel/settings";
import { realizeTemplateLayoutCatalog } from "@/registry/realizeTemplateLayoutCatalog.config";
import { realizeElementOwnerBindings } from "@/registry/realizeElementOwnerBindings.config";

const controlPanelIdentity = realizeElementOwnerBindings.find(
  (binding) =>
    binding.kind === "template" &&
    binding.source.templateId === controlPanelManifest.id &&
    binding.source.templateVersion === controlPanelManifest.version,
)?.identity;
if (!controlPanelIdentity)
  throw new Error("Control Panel template identity mapping is unavailable.");

/** Это доверенные exports сборки, не установка кода из БД и не автоматическая смена назначения. */
export const extensionTemplateCatalog: readonly ExtensionCatalogRegistration[] =
  [
    {
      manifest: realizeTemplateManifest,
      settingsSchema: realizeSettingsSchema,
      resolveSettings: resolveRealizeSettings,
    },
    {
      manifest: controlPanelManifest,
      layouts: {
        templateIdentity: controlPanelIdentity,
        catalog: realizeTemplateLayoutCatalog,
      },
      settingsSchema: controlPanelSettingsSchema,
      resolveSettings: resolveControlPanelSettings,
      readiness: "preview-only",
    },
  ];
