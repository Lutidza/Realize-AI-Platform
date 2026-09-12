/**
 * @file packages/ui-kit/src/surface/UiSurface.types.ts
 * @version 1.2.0
 * @date 2026-09-10
 * @description Задаёт варианты общей поверхности и композицию с внешней ссылкой.
 */

import type { ComponentProps } from "react";

export type UiSurfaceProps = ComponentProps<"div"> & {
  asChild?: boolean;
  /** flush встраивает поверхность в оболочку без собственной рамки, тени и скруглений. */
  appearance?: "card" | "flush";
  interactive?: boolean;
  /** raised выделяет вложенный элемент, accent — основную поверхность. */
  tone?: "default" | "raised" | "accent";
};
