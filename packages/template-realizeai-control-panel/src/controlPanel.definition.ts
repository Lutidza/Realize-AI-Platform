/**
 * @file packages/template-realizeai-control-panel/src/controlPanel.definition.ts
 * @version 1.0.0
 * @date 2026-11-11
 * @description Собирает проверенный паспорт, renderer и локальный каталог макета Control Panel.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { controlPanelManifest } from "./controlPanelManifest.index";
import { ControlPanelTemplate } from "./ControlPanelTemplate.component";
import {
  controlPanelDefaultLayoutId,
  controlPanelLayouts,
} from "./controlPanelLayouts.config";
import {
  controlPanelPalette,
  controlPanelUi,
  getControlPanelThemeStyle,
} from "./controlPanelTheme.config";
import { resolveControlPanelSettings } from "./settings/resolveControlPanelSettings.validator";
import type { ControlPanelDefinition } from "./ControlPanelDefinition.types";

/** Реальная реализация default подключается без зависимости от legacy template-realize. */
export const controlPanelDefinition: ControlPanelDefinition = {
  manifest: controlPanelManifest,
  Renderer: ControlPanelTemplate,
  palettes: [controlPanelPalette],
  ui: controlPanelUi,
  resolveSettings: resolveControlPanelSettings,
  getThemeStyle: getControlPanelThemeStyle,
  defaultLayoutId: controlPanelDefaultLayoutId,
  layouts: controlPanelLayouts,
};
