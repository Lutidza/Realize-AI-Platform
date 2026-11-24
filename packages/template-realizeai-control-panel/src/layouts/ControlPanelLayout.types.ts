/**
 * @file packages/template-realizeai-control-panel/src/layouts/ControlPanelLayout.types.ts
 * @version 1.2.0
 * @date 2026-11-17
 * @description Определяет независимые области макетов Control Panel.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { CONTROL_PANEL_LAYOUT_IDS } from "../controlPanelLayouts.constants";
import type { ReactNode } from "react";
import type { TemplateMode } from "@realize/template-contracts";

/** Наполнение областей независимо от их существования; пустые области сохраняют геометрию. */
export type ControlPanelLayoutProps = {
  mode: TemplateMode;
  brand?: ReactNode;
  rail?: ReactNode;
  topbar?: ReactNode;
  sidebar?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
};

/** Общий ID используется schema, compiled каталогом и preview. */
export type ControlPanelLayoutId = (typeof CONTROL_PANEL_LAYOUT_IDS)[number];

/** Внутренний frame получает структуру только от зарегистрированной реализации макета. */
export type ControlPanelFrameProps = ControlPanelLayoutProps & {
  layoutId: ControlPanelLayoutId;
  /** Получается из проверенного descriptor, не из пустоты topbar content. */
  hasTopbar: boolean;
};
