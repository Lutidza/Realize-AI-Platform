/**
 * @file packages/template-realize/src/settings/getRealizeThemeStyle.util.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проецирует проверенные настройки Realize в style tokens всех UI roots.
 * @see documentation/architecture/ui-kit.md
 */
import type { TemplateSettings } from "@realize/template-contracts";
import type { TemplateThemeStyle } from "@realize/template-contracts/react";
import { resolveRealizeSettings } from "./resolveRealizeSettings.validator";

/** Comfortable повторяет прежние значения; compact реально уменьшает controls и интервалы. */
export function getRealizeThemeStyle(
  input: TemplateSettings,
): TemplateThemeStyle {
  const settings = resolveRealizeSettings(input);
  if (settings.density === "comfortable") {
    return { "--realize-admin-panel-width": `${settings.panelWidth}px` };
  }
  return {
    "--realize-admin-panel-width": `${settings.panelWidth}px`,
    "--ui-control-height": "36px",
    "--ui-space-1": "3px",
    "--ui-space-2": "6px",
    "--ui-space-3": "9px",
    "--ui-space-4": "12px",
    "--ui-space-5": "15px",
    "--ui-space-6": "18px",
    "--ui-space-8": "24px",
    "--ui-layout-gap": "12px",
  };
}
