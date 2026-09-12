/**
 * @file packages/ui-kit/src/textarea/UiTextarea.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Определяет native-контракт многострочного поля UI-кита.
 */

import type { ComponentProps } from "react";

/** Сохраняет native-события, ref, ограничения ввода и связи с подсказками. */
export type UiTextareaProps = ComponentProps<"textarea"> & {
  appearance?: "field" | "plain";
};
