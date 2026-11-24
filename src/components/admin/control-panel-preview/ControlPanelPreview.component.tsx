/**
 * @file src/components/admin/control-panel-preview/ControlPanelPreview.component.tsx
 * @version 1.3.0
 * @date 2026-11-22
 * @description Связывает preview controller и серверный контент с общим controlled template provider.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use client";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { SystemAdminTemplateHost } from "@/components/admin/system-shell/SystemAdminTemplateHost.component";
import { ControlPanelPreviewControls } from "./ControlPanelPreviewControls.component";
import { controlPanelPreviewStateContext } from "./controlPanelPreviewState.context";
import { useControlPanelPreview } from "./useControlPanelPreview.hook";
import type { ControlPanelPreviewProps } from "./ControlPanelPreview.types";

/** Не сохраняет assignments и cookie; один controller переживает смену макетов и темы. */
export function ControlPanelPreview({
  children,
  ...initial
}: ControlPanelPreviewProps) {
  const preview = useControlPanelPreview(initial);
  const { state } = preview;
  return (
    <SystemAdminTemplateProvider
      selection={{
        templateId: "realizeai-control-panel",
        templateVersion: "0.1.0",
        target: "admin",
        paletteId: "realizeai-control-panel",
        paletteVersion: "0.1.0",
        mode: state.mode,
      }}
      mode={state.mode}
      onModeChange={preview.setMode}
      settings={
        state.layoutId === undefined ? {} : { layoutId: state.layoutId }
      }
    >
      <ControlPanelPreviewControls
        {...state}
        open={preview.open}
        onOpenChange={preview.setOpen}
        onModeChange={preview.setMode}
        onLayoutChange={preview.setLayoutId}
      />
      {/* Постоянная DOM-граница canvas сохраняет outside-dismiss при смене renderer. */}
      <div data-preview-canvas>
        <SystemAdminTemplateHost
          screen="workspace"
          mode={state.mode}
          navigation={[]}
          activeNavigationId=""
        >
          <controlPanelPreviewStateContext.Provider value={state}>
            {typeof children === "function" ? children(state) : children}
          </controlPanelPreviewStateContext.Provider>
        </SystemAdminTemplateHost>
      </div>
    </SystemAdminTemplateProvider>
  );
}
