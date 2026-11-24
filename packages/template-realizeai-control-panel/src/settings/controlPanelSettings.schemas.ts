/**
 * @file packages/template-realizeai-control-panel/src/settings/controlPanelSettings.schemas.ts
 * @version 1.1.0
 * @date 2026-11-11
 * @description Определяет строгую схему настроек макетов Control Panel.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { z } from "zod";
import {
  CONTROL_PANEL_LAYOUT_IDS,
  CONTROL_PANEL_LAYOUT_LABELS,
} from "../controlPanelLayouts.constants.ts";

/** Отсутствующий layoutId сохраняет наследование; effective default не записывается в settings. */
export const controlPanelSettingsSchema = z.strictObject({
  density: z
    .enum(["comfortable", "compact"])
    .default("comfortable")
    .meta({
      title: "Плотность содержимого",
      "x-enumLabels": { comfortable: "Просторно", compact: "Компактно" },
    }),
  panelWidth: z.number().int().min(220).max(400).default(280).meta({
    title: "Ширина боковой панели",
  }),
  layoutId: z.enum(CONTROL_PANEL_LAYOUT_IDS).optional().meta({
    title: "Макет",
    "x-enumLabels": CONTROL_PANEL_LAYOUT_LABELS,
    description:
      "Отсутствие значения означает наследование макета по умолчанию.",
  }),
});
