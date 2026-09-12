/**
 * @file packages/ui-kit/src/textarea/UiTextarea.component.tsx
 * @version 1.1.0
 * @date 2026-09-09
 * @description Отображает многострочное поле с общими состояниями поля UI-кита.
 */

import styles from "../input/UiInput.module.css";
import type { UiTextareaProps } from "./UiTextarea.types";

/** Использует оформление UiInput; размер и изменение высоты задаёт потребитель. */
export const UiTextarea = ({
  appearance = "field",
  className,
  ...props
}: UiTextareaProps) => (
  <textarea
    {...props}
    className={[styles.input, className].filter(Boolean).join(" ")}
    data-ui="textarea"
    data-appearance={appearance}
  />
);
