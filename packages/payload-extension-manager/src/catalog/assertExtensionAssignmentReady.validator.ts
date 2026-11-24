/**
 * @file packages/payload-extension-manager/src/catalog/assertExtensionAssignmentReady.validator.ts
 * @version 1.0.0
 * @date 2026-11-12
 * @description Отделяет preview доступного кандидата от допуска назначения к рабочему исполнению.
 * @see documentation/specifications/extension-management.md
 */
import type { TemplateSelection } from "@realize/template-contracts";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";
import type {
  ExtensionCatalog,
  ExtensionTemplateReadiness,
} from "./ExtensionCatalog.types";

/** Текущая политика exact entry для DTO; неизвестная историческая identity не переписывает replay ledger. */
export function getExtensionTemplateReadiness(
  catalog: ExtensionCatalog,
  selection: TemplateSelection,
): ExtensionTemplateReadiness | undefined {
  return catalog.entries.find(
    ({ manifest }) =>
      manifest.id === selection.templateId &&
      manifest.version === selection.templateVersion,
  )?.readiness;
}

/** Вызывается после проверки exact назначения; отсутствие политики означает ready. */
export function assertExtensionAssignmentReady(
  catalog: ExtensionCatalog,
  selection: TemplateSelection,
): void {
  if (getExtensionTemplateReadiness(catalog, selection) === "preview-only")
    throw new ExtensionManagerError("TEMPLATE_PREVIEW_ONLY");
}
