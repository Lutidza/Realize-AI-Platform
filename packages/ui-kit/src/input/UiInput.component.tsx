/**
 * @file packages/ui-kit/src/input/UiInput.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает native-поле ввода с общими состояниями UI-кита.
 */

import type { UiInputProps } from "./UiInput.types";
import styles from "./UiInput.module.css";

/** Использует aria-invalid для оформления ошибки; label и подсказки задаёт потребитель. */
export const UiInput = ({ className, ...props }: UiInputProps) => (
  <input
    {...props}
    className={[styles.input, className].filter(Boolean).join(" ")}
    data-ui="input"
  />
);
