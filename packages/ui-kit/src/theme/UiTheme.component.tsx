/**
 * @file packages/ui-kit/src/theme/UiTheme.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Применяет семантические токены UI-кита к дочернему интерфейсу.
 */

import type { UiThemeProps } from "./UiTheme.types";
import styles from "./UiTheme.module.css";

/** Ограничивает тему поддеревом; не меняет глобальные стили приложения. */
export const UiTheme = ({ className = "", mode, ...props }: UiThemeProps) => (
  <div
    {...props}
    className={`${styles.theme} ${className}`}
    data-ui-theme={mode}
  />
);
