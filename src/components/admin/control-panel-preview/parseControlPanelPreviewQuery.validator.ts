/**
 * @file src/components/admin/control-panel-preview/parseControlPanelPreviewQuery.validator.ts
 * @version 1.1.0
 * @date 2026-11-22
 * @description Проверяет URL выбора темы и макета одинаково на сервере и в истории браузера.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { CONTROL_PANEL_LAYOUT_IDS } from "@realize/template-realizeai-control-panel/manifest";
import type { ControlPanelPreviewState } from "./ControlPanelPreview.types";

/** Пустой layout — только UI-наследование; повторяющиеся или неизвестные значения отклоняются. */
export function parseControlPanelPreviewQuery(input: {
  mode?: unknown;
  layout?: unknown;
}): ControlPanelPreviewState | null {
  const mode = input.mode ?? "light";
  if (mode !== "light" && mode !== "dark") return null;
  const raw = input.layout;
  if (raw === undefined || raw === "") return { mode };
  const layoutId = CONTROL_PANEL_LAYOUT_IDS.find((id) => id === raw);
  return layoutId === undefined ? null : { mode, layoutId };
}
