/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminNavigationLink.component.tsx
 * @version 1.3.0
 * @date 2026-09-18
 * @description Отображает пункт навигации и вложенные быстрые ссылки с независимой доступностью действий.
 * @see documentation/architecture/system-admin-shell.md
 */

import { useId } from "react";
import { UiButton } from "../button/UiButton.component";
import { getUiButtonClassName } from "../button/getUiButtonClassName.util";
import { SystemAdminItemMenu } from "./SystemAdminItemMenu.component";
import type { SystemAdminNavigationLinkProps } from "./SystemAdminShell.types";
import styles from "./SystemAdminNavigationGroups.module.css";

/** Недоступность родительской строки не распространяется на самостоятельные быстрые ссылки. */
export function SystemAdminNavigationLink({
  item,
  onNavigate,
  favoriteId,
}: SystemAdminNavigationLinkProps) {
  const id = useId();
  const disabled = item.disabled || (!item.href && !item.onSelect);
  const descriptionId = item.description ? `${id}-description` : undefined;
  const chooseItem = () => {
    if (disabled) return;
    item.onSelect?.();
    onNavigate();
  };
  const content = (
    <>
      <span className={styles.icon} aria-hidden="true">
        {item.icon}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{item.label}</span>
        {item.statusLabel ? (
          <span className={styles.status}>{item.statusLabel}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <li>
      <div
        className={styles.row}
        data-navigation-item="row"
        data-active={item.active || undefined}
      >
        {item.href && !disabled ? (
          <a
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            data-navigation-item-select
            className={getUiButtonClassName({
              variant: "ghost",
              className: styles.item,
            })}
            title={item.description}
            aria-describedby={descriptionId}
            onClick={chooseItem}
          >
            {content}
          </a>
        ) : (
          <UiButton
            variant="ghost"
            data-navigation-item-select
            className={styles.item}
            aria-current={item.active ? "page" : undefined}
            disabled={disabled}
            title={item.description}
            aria-describedby={descriptionId}
            onClick={chooseItem}
          >
            {content}
          </UiButton>
        )}
        <SystemAdminItemMenu
          favoriteId={favoriteId ?? `link:${item.id}`}
          label={item.label}
          href={disabled ? undefined : item.href}
        />
      </div>
      {item.description ? (
        <span id={descriptionId} className={styles.description}>
          {item.description}
        </span>
      ) : null}
      {item.shortcuts?.length ? (
        <ul
          className={`${styles.list} ${styles.shortcuts}`}
          aria-label={`Быстрые ссылки: ${item.label}`}
        >
          {item.shortcuts.map((shortcut) => (
            <SystemAdminNavigationLink
              key={shortcut.id}
              item={shortcut}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
