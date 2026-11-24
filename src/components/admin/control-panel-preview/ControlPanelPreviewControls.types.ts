/**
 * @file src/components/admin/control-panel-preview/ControlPanelPreviewControls.types.ts
 * @version 2.1.0
 * @date 2026-11-22
 * @description Определяет проверенные параметры панели предпросмотра.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { TemplateMode } from "@realize/template-contracts";
import type { ControlPanelLayoutId } from "@realize/template-realizeai-control-panel/manifest";

export type ControlPanelPreviewControlsProps = {
  mode: TemplateMode;
  layoutId?: ControlPanelLayoutId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: TemplateMode) => void;
  onLayoutChange: (layoutId: ControlPanelLayoutId | undefined) => void;
};
