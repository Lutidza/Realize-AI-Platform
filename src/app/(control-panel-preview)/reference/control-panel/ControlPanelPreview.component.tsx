/**
 * @file src/app/(control-panel-preview)/reference/control-panel/ControlPanelPreview.component.tsx
 * @version 1.2.0
 * @date 2026-11-22
 * @description Подключает route-local grid demo к общему preview shell и его текущему URL-состоянию.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use client";
import { ControlPanelPreview as ControlPanelPreviewShell } from "@/components/admin/control-panel-preview/ControlPanelPreview.component";
import type { ControlPanelPreviewState } from "@/components/admin/control-panel-preview/ControlPanelPreview.types";
import { ControlPanelGridPreview } from "./ControlPanelGridPreview.component";

/** Client render child сохраняет ссылку демо в текущих mode/layout без второго controller. */
export function ControlPanelPreview(initial: ControlPanelPreviewState) {
  return (
    <ControlPanelPreviewShell {...initial}>
      {(state) => <ControlPanelGridPreview {...state} />}
    </ControlPanelPreviewShell>
  );
}
