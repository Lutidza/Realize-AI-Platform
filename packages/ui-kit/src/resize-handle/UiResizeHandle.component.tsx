/**
 * @file packages/ui-kit/src/resize-handle/UiResizeHandle.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отображает фокусируемый край изменения ширины без владения размерами панели.
 */

import type { UiResizeHandleProps } from "./UiResizeHandle.types";
import styles from "./UiResizeHandle.module.css";

/** Потребитель задаёт ограничения и обработку pointer/keyboard; размеры передаются в пикселях. */
export const UiResizeHandle = ({
  label,
  controls,
  value,
  min,
  max,
  className = "",
  ...props
}: UiResizeHandleProps) => (
  <div
    {...props}
    role="separator"
    aria-label={label}
    aria-controls={controls}
    aria-orientation="vertical"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={`${value} пикселей`}
    tabIndex={0}
    className={`${styles.handle} ${className}`}
  />
);
