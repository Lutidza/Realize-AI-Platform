/**
 * @file src/components/admin/extensions/extensionDraftChanged.util.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Сравнивает selection и JSON settings семантически перед заменой несохранённого черновика.
 */
import type { TemplateJsonValue } from "@realize/template-contracts";
import type { ExtensionAppearanceDraft } from "./ExtensionManager.types";
import { readExtensionSettings } from "./extensionSettingsFields.util";

function canonical(value: TemplateJsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function extensionDraftChanged(
  draft: ExtensionAppearanceDraft,
  baseline: ExtensionAppearanceDraft | null,
): boolean {
  if (!baseline) return true;
  const current = readExtensionSettings(draft.settingsText);
  const initial = readExtensionSettings(baseline.settingsText);
  if (!current.valid || !initial.valid)
    return draft.settingsText !== baseline.settingsText;
  const selection = draft.selection;
  const source = baseline.selection;
  return (
    selection.templateId !== source.templateId ||
    selection.templateVersion !== source.templateVersion ||
    selection.target !== source.target ||
    selection.paletteId !== source.paletteId ||
    selection.paletteVersion !== source.paletteVersion ||
    selection.mode !== source.mode ||
    canonical(current.value) !== canonical(initial.value)
  );
}
