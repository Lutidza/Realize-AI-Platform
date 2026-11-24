/**
 * @file packages/payload-extension-manager/src/catalog/assertExtensionLayoutCatalogScope.validator.ts
 * @version 1.0.0
 * @date 2026-11-18
 * @description Сверяет выпуск и поверхности проверенного layout catalog с native manifest без угадывания global ID.
 * @see documentation/specifications/extension-management.md
 */
import type {
  ParsedTemplateLayoutCatalog,
  TemplateManifest,
} from "@realize/template-contracts";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";

/** Global identity связывает host; native manifest ID не используется как универсальная global identity. */
export function assertExtensionLayoutCatalogScope(
  catalog: ParsedTemplateLayoutCatalog,
  manifest: TemplateManifest,
): void {
  if (
    catalog.template.version !== manifest.version ||
    catalog.descriptors.some(
      (descriptor) =>
        !manifest.targets.some(
          (target) =>
            target.target === descriptor.target &&
            target.screens.some((screen) => screen === descriptor.screen),
        ),
    )
  )
    throw new ExtensionManagerError("INVALID_CATALOG");
}
