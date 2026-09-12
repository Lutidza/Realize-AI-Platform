/**
 * @file packages/ui-kit/src/button/getUiButtonClassName.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Собирает единые классы кнопки для UiButton и адаптеров внешних native-кнопок.
 */

import type { UiButtonProps } from "./UiButton.types";
import styles from "./UiButton.module.css";

export const getUiButtonClassName = ({
  className,
  size = "default",
  variant = "primary",
}: Pick<UiButtonProps, "className" | "size" | "variant"> = {}) =>
  [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");
