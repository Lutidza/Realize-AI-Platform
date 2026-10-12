/**
 * @file packages/ui-kit/src/button/UiButtonPrimitive.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Реализует базовую native кнопку для самостоятельного UI и template compositions.
 */
import type { UiButtonProps } from "./UiButton.types";
import { getUiButtonClassName } from "./getUiButtonClassName.util";

/** Прямой primitive не вызывает adapter повторно; autocomplete=off сохраняет disabled при Firefox hydration. */
export function UiButtonPrimitive({
  className,
  size = "default",
  type = "button",
  variant = "primary",
  disabledAppearance = "muted",
  ...props
}: UiButtonProps) {
  return (
    <button
      {...{ autoComplete: "off" }}
      {...props}
      className={getUiButtonClassName({ className, size, variant })}
      data-ui="button"
      data-disabled-appearance={disabledAppearance}
      type={type}
    />
  );
}
