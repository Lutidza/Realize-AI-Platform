/**
 * @file packages/ui-kit/src/button/UiButton.component.tsx
 * @version 1.3.0
 * @date 2026-10-12
 * @description Разрешает кнопку активного template adapter либо самостоятельного UI-kit.
 */
"use client";

import type { UiButtonProps } from "./UiButton.types";
import { UiButtonPrimitive } from "./UiButtonPrimitive.component";
import { useUiTemplateRuntime } from "../template-runtime/useUiTemplateRuntime.hook";

/** Компонент не импортирует Realize: любой совместимый пакет предоставляет Button. */
export function UiButton(props: UiButtonProps) {
  const runtime = useUiTemplateRuntime();
  const Button = runtime?.ui.Button ?? UiButtonPrimitive;
  return <Button {...props} />;
}
