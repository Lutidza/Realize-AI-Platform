/**
 * @file packages/ui-kit/src/switch/UiSwitch.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает доступный нативный переключатель с оформлением UI-кита.
 */

import type { UiSwitchProps } from "./UiSwitch.types";
import styles from "./UiSwitch.module.css";

/** Имя через label или aria-label задаёт потребитель; className и ref относятся к input. */
export const UiSwitch = ({ className, ...props }: UiSwitchProps) => (
  <span className={styles.switch} data-ui="switch">
    <input
      {...props}
      className={[styles.input, className].filter(Boolean).join(" ")}
      type="checkbox"
      role="switch"
    />
    <span aria-hidden="true" className={styles.track}>
      <span className={styles.thumb} />
    </span>
  </span>
);
