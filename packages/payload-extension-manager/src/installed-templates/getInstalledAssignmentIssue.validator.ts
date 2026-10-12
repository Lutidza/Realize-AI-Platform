/**
 * @file packages/payload-extension-manager/src/installed-templates/getInstalledAssignmentIssue.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Выявляет недоступный saved assignment без переписывания версии или нормализованных settings.
 * @see documentation/specifications/extension-management.md
 */
import type {
  TemplateJsonValue,
  TemplateTarget,
} from "@realize/template-contracts";
import type { ExtensionAssignment } from "../appearance/ExtensionAppearance.types";
import type { ExtensionCatalog } from "../catalog/ExtensionCatalog.types";
import { resolveExtensionAssignment } from "../catalog/resolveExtensionAssignment.validator";
import type { InstalledTemplateUnavailableAssignmentDto } from "./InstalledTemplates.types";
import { getInstalledCompatibleTargets } from "./getInstalledCompatibleTargets.validator";

/** JSON equality учитывает содержимое settings, но не порядок ключей; это не artifact digest. */
function canonicalJson(value: TemplateJsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** Read-only validation: неизвестная версия не заменяется latest/default, ошибка не раскрывает raw data. */
export function getInstalledAssignmentIssue(
  catalog: ExtensionCatalog,
  target: TemplateTarget,
  assignment: ExtensionAssignment,
): InstalledTemplateUnavailableAssignmentDto["reason"] | null {
  const entry = catalog.entries.find(
    ({ manifest }) =>
      manifest.id === assignment.selection.templateId &&
      manifest.version === assignment.selection.templateVersion,
  );
  if (!entry) return "not_compiled";
  if (!getInstalledCompatibleTargets(catalog, entry).includes(target))
    return "incompatible";
  try {
    const resolved = resolveExtensionAssignment({
      catalog,
      target,
      selection: assignment.selection,
      settings: assignment.settings,
    });
    if (
      resolved.manifestHash !== assignment.manifestHash ||
      canonicalJson(resolved.settings) !== canonicalJson(assignment.settings)
    )
      return "invalid_assignment";
    return null;
  } catch {
    return "invalid_assignment";
  }
}
