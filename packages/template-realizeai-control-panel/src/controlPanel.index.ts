/**
 * @file packages/template-realizeai-control-panel/src/controlPanel.index.ts
 * @version 1.1.0
 * @date 2026-11-11
 * @description Экспортирует compiled Admin definition и публичные области макета.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use client";
export { controlPanelDefinition } from "./controlPanel.definition";
export { ControlPanelLayout } from "./layouts/ControlPanelLayout.component";
export type { ControlPanelLayoutProps } from "./layouts/ControlPanelLayout.types";

export { ControlPanelWithoutTopbarLayout } from "./layouts/ControlPanelWithoutTopbarLayout.component";
export type { ControlPanelLayoutId } from "./layouts/ControlPanelLayout.types";
