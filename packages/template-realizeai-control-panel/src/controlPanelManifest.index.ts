/**
 * @file packages/template-realizeai-control-panel/src/controlPanelManifest.index.ts
 * @version 1.1.0
 * @date 2026-11-11
 * @description Экспортирует проверенный паспорт Control Panel без React и CSS.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { parseTemplateManifest } from "@realize/template-contracts";
import manifest from "../template.manifest.json";

/** Паспорт первого среза объявляет только действительно реализованный рабочий экран. */
export const controlPanelManifest = parseTemplateManifest(manifest);

export {
  CONTROL_PANEL_LAYOUT_IDS,
  CONTROL_PANEL_LAYOUT_LABELS,
} from "./controlPanelLayouts.constants";
export type { ControlPanelLayoutId } from "./layouts/ControlPanelLayout.types";
