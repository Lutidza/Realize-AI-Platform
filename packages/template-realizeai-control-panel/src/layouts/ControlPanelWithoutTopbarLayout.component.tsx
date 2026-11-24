/**
 * @file packages/template-realizeai-control-panel/src/layouts/ControlPanelWithoutTopbarLayout.component.tsx
 * @version 1.0.1
 * @date 2026-11-17
 * @description Подключает макет без верхней панели к общему frame.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { assertLayoutSlots } from "@realize/template-contracts";
import { controlPanelLayouts } from "../controlPanelLayouts.config";
import type { ControlPanelLayoutProps } from "./ControlPanelLayout.types";

/** Отсутствие header задаётся структурой макета, а не пустотой его содержимого. */
export function ControlPanelWithoutTopbarLayout(
  props: ControlPanelLayoutProps,
) {
  const layout = controlPanelLayouts.find(
    (item) => item.id === "without-topbar",
  )!;
  if (
    props.topbar !== undefined &&
    props.topbar !== null &&
    props.topbar !== false
  )
    assertLayoutSlots(layout.descriptor, ["topbar"]);
  const Frame = layout.Component;
  return <Frame {...props} {...layout.frameProps} />;
}
