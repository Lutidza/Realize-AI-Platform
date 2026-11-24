/**
 * @file packages/template-realizeai-control-panel/src/layouts/ControlPanelLayout.component.tsx
 * @version 1.0.2
 * @date 2026-11-17
 * @description Подключает стандартную структуру областей к общему frame.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { controlPanelLayouts } from "../controlPanelLayouts.config";
import type { ControlPanelLayoutProps } from "./ControlPanelLayout.types";

/** Пустой topbar сохраняется как область стандартного макета. */
export function ControlPanelLayout(props: ControlPanelLayoutProps) {
  const layout = controlPanelLayouts.find((item) => item.id === "default")!;
  const Frame = layout.Component;
  return <Frame {...props} {...layout.frameProps} />;
}
