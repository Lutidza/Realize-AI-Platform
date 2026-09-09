/**
 * @file packages/ui-kit/src/badge/UiBadge.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает общий текстовый статус с необязательной цветной точкой.
 */

import type { UiBadgeProps } from "./UiBadge.types";
import styles from "./UiBadge.module.css";

export const UiBadge = ({
  className = "",
  children,
  tone = "neutral",
  dot = false,
  ...props
}: UiBadgeProps) => (
  <span
    {...props}
    className={`${styles.badge} ${tone === "neutral" ? "" : styles[tone]} ${className}`}
  >
    {dot ? <span aria-hidden="true" className={styles.dot} /> : null}
    {children}
  </span>
);
