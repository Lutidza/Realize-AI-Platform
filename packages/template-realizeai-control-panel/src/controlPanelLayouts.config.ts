/**
 * @file packages/template-realizeai-control-panel/src/controlPanelLayouts.config.ts
 * @version 2.0.0
 * @date 2026-11-17
 * @description Связывает макеты с их реальными реализациями для definition и renderer.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { resolveTemplateLayout } from "@realize/template-contracts";
import { ControlPanelFrame } from "./layouts/ControlPanelFrame.component";
import { controlPanelLayoutCatalog } from "./controlPanelLayouts.metadata";
import { assertControlPanelLayoutBindings } from "./assertControlPanelLayoutBindings.validator";
import {
  CONTROL_PANEL_DEFAULT_LAYOUT_ID,
  CONTROL_PANEL_LAYOUT_IDS,
} from "./controlPanelLayouts.constants";
import type { ControlPanelLayoutDefinition } from "./ControlPanelDefinition.types";

export const controlPanelDefaultLayoutId = CONTROL_PANEL_DEFAULT_LAYOUT_ID;
/** Один каталог используется и при объявлении пакета, и при выборе макета. */
export const controlPanelLayouts: readonly ControlPanelLayoutDefinition[] =
  CONTROL_PANEL_LAYOUT_IDS.map((id) => {
    const { descriptor, reference } = resolveTemplateLayout(
      controlPanelLayoutCatalog,
      id,
    );
    return {
      id,
      label: descriptor.title,
      target: descriptor.target,
      screen: descriptor.screen,
      reference,
      descriptor,
      frameProps: {
        layoutId: id,
        hasTopbar: descriptor.regions.some((region) => region.key === "topbar"),
      },
      Component: ControlPanelFrame,
    };
  });
assertControlPanelLayoutBindings(
  controlPanelLayoutCatalog,
  controlPanelLayouts,
);
