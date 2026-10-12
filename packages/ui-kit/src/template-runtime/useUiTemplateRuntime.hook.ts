/**
 * @file packages/ui-kit/src/template-runtime/useUiTemplateRuntime.hook.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Читает выбранный adapter без импорта конкретного template-пакета.
 */
"use client";
import { useContext } from "react";
import { UI_TEMPLATE_RUNTIME_CONTEXT } from "./uiTemplateRuntime.constants";

/** null означает самостоятельное использование базового UI-kit вне template host. */
export function useUiTemplateRuntime() {
  return useContext(UI_TEMPLATE_RUNTIME_CONTEXT);
}
