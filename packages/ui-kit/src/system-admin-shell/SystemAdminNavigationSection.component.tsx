/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminNavigationSection.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Задаёт общую именованную секцию навигации с заголовком, разделителем и контекстным действием.
 * @see documentation/architecture/system-admin-shell.md
 */

import { useId } from "react";
import type { SystemAdminNavigationSectionProps } from "./SystemAdminShell.types";
import styles from "./SystemAdminNavigationGroups.module.css";

/** Первая группа может скрыть заголовок, сохраняя доступное имя секции. */
export function SystemAdminNavigationSection({
  label,
  hideHeading = false,
  action,
  children,
}: SystemAdminNavigationSectionProps) {
  const headingId = useId();

  return (
    <section
      className={styles.section}
      aria-label={hideHeading ? label : undefined}
      aria-labelledby={hideHeading ? undefined : headingId}
    >
      {!hideHeading || action ? (
        <div className={styles.sectionHeader}>
          {!hideHeading ? (
            <h3 id={headingId} className={styles.heading}>
              {label}
            </h3>
          ) : null}
          {action ? <div className={styles.sectionAction}>{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
