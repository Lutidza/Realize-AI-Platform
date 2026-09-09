/**
 * @file packages/ui-kit/src/notice/UiNotice.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает общее сообщение с заголовком, содержимым и декоративной иконкой.
 */

import type { UiNoticeProps } from "./UiNotice.types";
import styles from "./UiNotice.module.css";

/** Сохраняет нативные свойства div и не назначает автоматический alert или live region. */
export const UiNotice = ({
  className,
  children,
  tone = "neutral",
  title,
  icon,
  ...props
}: UiNoticeProps) => (
  <div
    {...props}
    className={[styles.notice, styles[tone], className]
      .filter(Boolean)
      .join(" ")}
    data-ui="notice"
  >
    {icon ? (
      <span aria-hidden="true" className={styles.icon}>
        {icon}
      </span>
    ) : null}
    <div className={styles.content}>
      {title ? <div className={styles.title}>{title}</div> : null}
      {children}
    </div>
  </div>
);
