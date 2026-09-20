/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminBreadcrumbs.component.tsx
 * @version 1.1.0
 * @date 2026-09-18
 * @description Выводит компактные крошки с текущей страницей и меню родительских уровней.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import { Fragment } from "react";
import { Ellipsis } from "lucide-react";
import { UiButton } from "../button/UiButton.component";
import { SystemAdminActionMenu } from "./SystemAdminActionMenu.component";
import { SystemAdminBreadcrumbMenu } from "./SystemAdminBreadcrumbMenu.component";
import { systemAdminMessages } from "./systemAdminLocale.messages";
import type { SystemAdminBreadcrumbsProps } from "./SystemAdminBreadcrumbs.types";
import styles from "./SystemAdminBreadcrumbs.module.css";

export function SystemAdminBreadcrumbs({
  items,
  label,
  locale = "ru",
  currentAsHeading = false,
  currentBadge,
}: SystemAdminBreadcrumbsProps) {
  const t = systemAdminMessages[locale];
  const collapsed = items.length > 3;
  const visibleItems = collapsed ? [items[0], ...items.slice(-2)] : items;
  return (
    <nav
      className={styles.path}
      aria-label={label ?? t.pageLocation}
      data-nested={items.length > 1}
    >
      <ol>
        {visibleItems.map((item, index) => {
          const current = index === visibleItems.length - 1;
          const content = item.choices ? (
            <SystemAdminBreadcrumbMenu
              item={item}
              current={current}
              asHeading={current && currentAsHeading}
              locale={locale}
            />
          ) : current ? (
            <span
              className={styles.currentText}
              aria-current="page"
              title={item.label}
            >
              {item.icon}
              <span className={styles.text}>{item.label}</span>
            </span>
          ) : (
            <UiButton
              variant="ghost"
              size="small"
              className={styles.link}
              onClick={item.onSelect}
              title={item.label}
            >
              {item.icon}
              <span className={styles.text}>{item.label}</span>
            </UiButton>
          );
          return (
            <Fragment key={item.id}>
              {index === 1 && items.length > 1 && (
                <li className={styles.collapsed} data-desktop={collapsed}>
                  <span className={styles.separator} aria-hidden="true" />
                  <SystemAdminActionMenu
                    label={t.ancestors}
                    heading={t.fullPath}
                    trigger={<Ellipsis size={16} aria-hidden="true" />}
                    className={styles.more}
                    align="start"
                    actions={items.slice(0, -1)}
                  />
                </li>
              )}
              <li className={current ? styles.current : styles.ancestor}>
                {index > 0 && (
                  <span className={styles.separator} aria-hidden="true" />
                )}
                {current && currentAsHeading && !item.choices ? (
                  <h1 className={styles.currentTitle} aria-label={item.label}>
                    {content}
                  </h1>
                ) : (
                  content
                )}
                {current && currentBadge && (
                  <span className={styles.currentBadge}>{currentBadge}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
