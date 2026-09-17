/**
 * @file packages/ui-kit/src/button/UiButton.component.tsx
 * @version 1.1.1
 * @date 2026-09-15
 * @description Отображает общую кнопку с вариантами и состояниями UI-кита.
 */

import type { UiButtonProps } from "./UiButton.types";
import { getUiButtonClassName } from "./getUiButtonClassName.util";

/** autocomplete=off в SSR не даёт Firefox восстанавливать устаревший disabled до hydration. */
export const UiButton = ({
  className,
  size = "default",
  type = "button",
  variant = "primary",
  ...props
}: UiButtonProps) => (
  <button
    {...{ autoComplete: "off" }}
    {...props}
    className={getUiButtonClassName({ className, size, variant })}
    data-ui="button"
    type={type}
  />
);
