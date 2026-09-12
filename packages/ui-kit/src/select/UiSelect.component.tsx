/**
 * @file packages/ui-kit/src/select/UiSelect.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отображает штатный список выбора с общим оформлением полей UI-кита.
 */

import styles from "../input/UiInput.module.css";
import type { UiSelectProps } from "./UiSelect.types";

/** Поведение клавиатуры и раскрывающегося списка остаётся у браузера. */
export const UiSelect = ({ className, ...props }: UiSelectProps) => (
  <select
    {...props}
    className={[styles.input, className].filter(Boolean).join(" ")}
    data-ui="select"
  />
);
