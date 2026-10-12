/**
 * @file packages/payload-extension-manager/src/installed-templates/getInstalledCompatibleTargets.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет совместимые targets пакета через существующий Template SDK.
 * @see documentation/specifications/extension-management.md
 */
import { resolveTemplateSelection } from "@realize/template-contracts";
import type { TemplateTarget } from "@realize/template-contracts";
import type {
  ExtensionCatalog,
  ExtensionCatalogEntry,
} from "../catalog/ExtensionCatalog.types";

/** Проверка host/capabilities не подменяется сравнением строк версий в inventory. */
export function getInstalledCompatibleTargets(
  catalog: ExtensionCatalog,
  entry: ExtensionCatalogEntry,
): TemplateTarget[] {
  const palette = entry.manifest.palettes[0];
  return entry.manifest.targets.flatMap(({ target }) => {
    try {
      resolveTemplateSelection({
        manifests: [entry.manifest],
        host: catalog.hostCompatibility,
        selection: {
          templateId: entry.manifest.id,
          templateVersion: entry.manifest.version,
          target,
          paletteId: palette.id,
          paletteVersion: palette.version,
          mode: palette.modes[0],
        },
      });
      return [target];
    } catch {
      return [];
    }
  });
}
