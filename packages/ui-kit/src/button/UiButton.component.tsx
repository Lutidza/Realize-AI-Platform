/**
 * @file packages/ui-kit/src/button/UiButton.component.tsx
 * @version 1.2.0
 * @date 2026-09-18
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
  disabledAppearance = "muted",
  ...props
}: UiButtonProps) => (
  <button
    {...{ autoComplete: "off" }}
    {...props}
    className={getUiButtonClassName({ className, size, variant })}
    data-ui="button"
    data-disabled-appearance={disabledAppearance}
    type={type}
  />
);
