/**
 * @file packages/ui-kit/src/button/UiButton.types.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Задаёт native-свойства, размеры и варианты общей кнопки.
 */

import type { ComponentProps } from "react";

/** Сохраняет атрибуты, события и ref обычной кнопки; icon требует доступного имени. */
export type UiButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "icon" | "small";
  /** Сохраняет внешний вид варианта в референсе, не снимая нативную блокировку. */
  disabledAppearance?: "muted" | "preserved";
};
