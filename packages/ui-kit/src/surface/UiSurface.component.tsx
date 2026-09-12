/**
 * @file packages/ui-kit/src/surface/UiSurface.component.tsx
 * @version 1.2.0
 * @date 2026-09-10
 * @description Отображает поверхность UI-кита с необязательным градиентом и свечением.
 */

"use client";

import { Slot } from "@radix-ui/react-slot";
import type { UiSurfaceProps } from "./UiSurface.types";
import styles from "./UiSurface.module.css";

/** asChild сохраняет семантику и обработчики переданной ссылки или контейнера. */
export const UiSurface = ({
  asChild = false,
  appearance = "card",
  className = "",
  interactive = false,
  tone = "default",
  ...props
}: UiSurfaceProps) => {
  const Component = asChild ? Slot : "div";
  return (
    <Component
      {...props}
      className={`${styles.surface} ${tone !== "default" ? styles[tone] : ""} ${appearance === "flush" ? styles.flush : ""} ${interactive ? styles.interactive : ""} ${className}`}
    />
  );
};
