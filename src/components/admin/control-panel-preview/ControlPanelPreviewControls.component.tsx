/**
 * @file src/components/admin/control-panel-preview/ControlPanelPreviewControls.component.tsx
 * @version 2.1.0
 * @date 2026-11-22
 * @description Собирает preview из общих Button, Popover и SelectMenu.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use client";
import { Settings2 } from "lucide-react";
import { UiButton, UiPopover, UiSelectMenu, UiTheme } from "@realize/ui-kit";
import {
  CONTROL_PANEL_LAYOUT_IDS,
  CONTROL_PANEL_LAYOUT_LABELS,
} from "@realize/template-realizeai-control-panel/manifest";
import type { ControlPanelPreviewControlsProps } from "./ControlPanelPreviewControls.types";
import styles from "./ControlPanelPreviewControls.module.css";

/** Локальный CSS размещает только trigger и поля; общие компоненты владеют визуальным поведением. */
export function ControlPanelPreviewControls({
  mode,
  layoutId,
  open,
  onOpenChange,
  onModeChange,
  onLayoutChange,
}: ControlPanelPreviewControlsProps) {
  return (
    <UiTheme
      baseline
      mode={mode}
      className={styles.controls}
      data-preview-controls
    >
      <UiPopover
        open={open}
        onOpenChange={onOpenChange}
        mode={mode}
        title="Предпросмотр"
        renderTrigger={(props) => (
          <UiButton {...props} variant="ghost" appearance="toolbar">
            <Settings2 size={17} aria-hidden="true" />
            Предпросмотр
          </UiButton>
        )}
      >
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="preview-layout">Макет</label>
            <UiSelectMenu
              id="preview-layout"
              label="Макет"
              value={layoutId ?? "inherit"}
              options={[
                { value: "inherit", label: "По умолчанию" },
                ...CONTROL_PANEL_LAYOUT_IDS.map((id) => ({
                  value: id,
                  label: CONTROL_PANEL_LAYOUT_LABELS[id],
                })),
              ]}
              mode={mode}
              onValueChange={(value) => {
                if (value === "inherit") onLayoutChange(undefined);
                else {
                  const id = CONTROL_PANEL_LAYOUT_IDS.find(
                    (id) => id === value,
                  );
                  if (id) onLayoutChange(id);
                }
              }}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="preview-mode">Тема</label>
            <UiSelectMenu
              id="preview-mode"
              label="Тема"
              value={mode}
              options={[
                { value: "light", label: "Светлая" },
                { value: "dark", label: "Тёмная" },
              ]}
              mode={mode}
              onValueChange={(value) => {
                if (value === "light" || value === "dark") onModeChange(value);
              }}
            />
          </div>
        </div>
      </UiPopover>
    </UiTheme>
  );
}
