/**
 * @file packages/payload-extension-manager/src/catalog/resolveExtensionAssignment.validator.ts
 * @version 1.1.0
 * @date 2026-11-18
 * @description Проверяет exact compiled выбор и settings через общий SDK и доверенный package validator.
 * @see documentation/specifications/extension-management.md
 */
import {
  isTemplateSettings,
  resolveTemplateSelection,
  TemplateContractError,
  resolveTemplateLayout,
  parseLayoutAssignmentBinding,
} from "@realize/template-contracts";
import type { ResolveExtensionAssignmentInput } from "./ExtensionCatalog.types";
import type { ExtensionAssignment } from "../appearance/ExtensionAppearance.types";
import { ExtensionManagerError } from "../appearance/ExtensionManager.error";

/** Никаких default/latest/URL imports: выбранная версия уже должна быть в compiled registry. */
export function resolveExtensionAssignment(
  input: ResolveExtensionAssignmentInput,
): ExtensionAssignment {
  if (!isTemplateSettings(input.settings))
    throw new ExtensionManagerError("INVALID_SETTINGS");
  try {
    const selected = resolveTemplateSelection({
      manifests: input.catalog.entries.map((entry) => entry.manifest),
      host: input.catalog.hostCompatibility,
      selection: input.selection,
    });
    if (selected.selection.target !== input.target)
      throw new ExtensionManagerError("INVALID_INPUT");
    const entry = input.catalog.entries.find(
      (candidate) =>
        candidate.manifest.id === selected.manifest.id &&
        candidate.manifest.version === selected.manifest.version,
    );
    if (!entry) throw new ExtensionManagerError("ASSIGNMENT_UNAVAILABLE");
    let settings;
    try {
      settings = entry.resolveSettings(structuredClone(input.settings));
    } catch {
      throw new ExtensionManagerError("INVALID_SETTINGS");
    }
    if (!isTemplateSettings(settings))
      throw new ExtensionManagerError("INVALID_SETTINGS");
    let layout;
    if (entry.layoutCatalog) {
      const explicit = Object.hasOwn(settings, "layoutId");
      if (explicit && typeof settings.layoutId !== "string")
        throw new ExtensionManagerError("INVALID_SETTINGS");
      const resolved = resolveTemplateLayout(
        entry.layoutCatalog,
        explicit ? (settings.layoutId as string) : undefined,
      );
      if (resolved.descriptor.target !== selected.selection.target)
        throw new ExtensionManagerError("ASSIGNMENT_UNAVAILABLE");
      layout = parseLayoutAssignmentBinding({
        schemaVersion: "1.0",
        localId: resolved.localId,
        reference: resolved.reference,
        catalogHash: entry.layoutCatalog.catalogHash,
      });
    }
    return {
      ...(layout === undefined ? {} : { layout }),
      selection: structuredClone(selected.selection),
      settings: structuredClone(settings),
      manifestHash: entry.manifestHash,
    };
  } catch (error) {
    if (error instanceof ExtensionManagerError) throw error;
    if (error instanceof TemplateContractError)
      throw new ExtensionManagerError("ASSIGNMENT_UNAVAILABLE");
    throw new ExtensionManagerError("INVALID_SETTINGS");
  }
}
