/**
 * @file packages/ui-kit/src/input/UiInput.component.tsx
 * @version 1.1.0
 * @date 2026-10-12
 * @description Разрешает Input активного template adapter с сохранением native API.
 */
"use client";

import type { UiInputProps } from "./UiInput.types";
import { UiInputPrimitive } from "./UiInputPrimitive.component";
import { useUiTemplateRuntime } from "../template-runtime/useUiTemplateRuntime.hook";

/** Label/ACL принадлежат consumer, размещение и оформление — выбранному Input. */
export function UiInput(props: UiInputProps) {
  const runtime = useUiTemplateRuntime();
  const Input = runtime?.ui.Input ?? UiInputPrimitive;
  return <Input {...props} />;
}
