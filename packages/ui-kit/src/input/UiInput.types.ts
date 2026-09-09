/**
 * @file packages/ui-kit/src/input/UiInput.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сохраняет native-контракт текстового поля UI-кита.
 */

import type { ComponentProps } from "react";

/** Передаёт native-атрибуты, события, ref и связи с подсказками без преобразования. */
export type UiInputProps = ComponentProps<"input">;
