/**
 * @file packages/template-realizeai-control-panel/src/controlPanelTheme.config.ts
 * @version 1.1.0
 * @date 2026-11-12
 * @description Связывает наследуемые примитивы, палитру и проверенные настройки оформления.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type {
  TemplatePaletteDefinition,
  TemplateThemeStyle,
  TemplateUiAdapter,
} from "@realize/template-contracts/react";
import type { TemplateSettings } from "@realize/template-contracts";
import { UiInputPrimitive } from "@realize/ui-kit";
import { ControlPanelButton } from "./primitives/ControlPanelButton.component";
import { resolveControlPanelSettings } from "./settings/resolveControlPanelSettings.validator";
import styles from "./palettes/ControlPanelPalette.module.css";

/** Прямые foundation primitives исключают рекурсивный dispatch adapter. */
export const controlPanelUi: TemplateUiAdapter = {
  Button: ControlPanelButton,
  Input: UiInputPrimitive,
};
export const controlPanelPalette: TemplatePaletteDefinition = {
  id: "realizeai-control-panel",
  version: "0.1.0",
  className: styles.palette,
  modes: ["light", "dark"],
};

/** Compact меняет плотность controls, но не размеры внешнего каркаса. */
export function getControlPanelThemeStyle(
  input: TemplateSettings,
): TemplateThemeStyle {
  const settings = resolveControlPanelSettings(input);
  return {
    "--panel-sidebar-width": `${settings.panelWidth}px`,
    ...(settings.density === "compact"
      ? { "--ui-control-height": "36px" }
      : {}),
  };
}
