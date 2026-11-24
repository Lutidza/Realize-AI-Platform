/**
 * @file src/components/admin/control-panel-preview/ControlPanelPreview.types.ts
 * @version 1.1.0
 * @date 2026-11-22
 * @description Определяет URL-состояние preview и контент общего shell независимо от renderer.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { TemplateMode } from "@realize/template-contracts";
import type { ControlPanelLayoutId } from "@realize/template-realizeai-control-panel/manifest";
import type { ReactNode } from "react";

export type ControlPanelPreviewState = {
  mode: TemplateMode;
  layoutId?: ControlPanelLayoutId;
};

/** Server child передаётся узлом; render child допустим только внутри клиентской композиции. */
export type ControlPanelPreviewProps = ControlPanelPreviewState & {
  children: ReactNode | ((state: ControlPanelPreviewState) => ReactNode);
};
