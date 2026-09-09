/**
 * @file packages/ui-kit/src/surface/UiSurface.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Задаёт варианты общей поверхности и композицию с внешней ссылкой.
 */

import type { ComponentProps } from "react";

export type UiSurfaceProps = ComponentProps<"div"> & {
  asChild?: boolean;
  interactive?: boolean;
  /** raised выделяет вложенный элемент, accent — основную поверхность. */
  tone?: "default" | "raised" | "accent";
};
