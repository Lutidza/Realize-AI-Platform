/**
 * @file packages/ui-kit/src/template-runtime/UiTemplateProvider.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Передаёт выбранные compiled UI и palette через React tree без лишнего DOM.
 * @see documentation/architecture/ui-kit.md
 */
"use client";
import { useMemo } from "react";
import { UI_TEMPLATE_RUNTIME_CONTEXT } from "./uiTemplateRuntime.constants";
import type { UiTemplateProviderProps } from "./UiTemplateRuntime.types";

/** React portals наследуют этот context; provider не перемонтирует controller владельца. */
export function UiTemplateProvider({
  children,
  templateId,
  templateVersion,
  palette,
  ui,
  style,
}: UiTemplateProviderProps) {
  const value = useMemo(
    () => ({ templateId, templateVersion, palette, ui, style }),
    [templateId, templateVersion, palette, ui, style],
  );
  return (
    <UI_TEMPLATE_RUNTIME_CONTEXT.Provider value={value}>
      {children}
    </UI_TEMPLATE_RUNTIME_CONTEXT.Provider>
  );
}
