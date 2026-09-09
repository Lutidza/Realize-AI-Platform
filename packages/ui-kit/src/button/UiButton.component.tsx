/**
 * @file packages/ui-kit/src/button/UiButton.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает общую кнопку с вариантами и состояниями UI-кита.
 */

import type { UiButtonProps } from "./UiButton.types";
import styles from "./UiButton.module.css";

/** По умолчанию выполняет действие без отправки формы; submit задаётся явно. */
export const UiButton = ({
  className,
  size = "default",
  type = "button",
  variant = "primary",
  ...props
}: UiButtonProps) => (
  <button
    {...props}
    className={[styles.button, styles[variant], styles[size], className]
      .filter(Boolean)
      .join(" ")}
    data-ui="button"
    type={type}
  />
);
