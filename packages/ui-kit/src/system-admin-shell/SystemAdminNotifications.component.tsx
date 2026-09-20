/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminNotifications.component.tsx
 * @version 1.1.0
 * @date 2026-09-18
 * @description Отображает колокольчик, непрочитанные уведомления и доступные переходы к их источникам.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { UiButton } from "../button/UiButton.component";
import { SystemAdminMenuContent } from "./SystemAdminMenuContent.component";
import { useSystemAdminActionMenu } from "./useSystemAdminActionMenu.hook";
import { systemAdminMessages } from "./systemAdminLocale.messages";
import type { SystemAdminNotificationsProps } from "./SystemAdminToolbar.types";
import menuStyles from "./SystemAdminFavorites.module.css";
import styles from "./SystemAdminToolbar.module.css";

export function SystemAdminNotifications({
  items,
  onReadAll,
  locale = "ru",
}: SystemAdminNotificationsProps) {
  const t = systemAdminMessages[locale];
  const menu = useSystemAdminActionMenu();
  const { triggerRef } = menu;
  const unread = items.filter((item) => item.unread).length;
  return (
    <DropdownMenu.Root
      modal={false}
      open={menu.open}
      onOpenChange={menu.setOpen}
    >
      <DropdownMenu.Trigger asChild>
        <UiButton
          ref={triggerRef}
          variant="ghost"
          size="icon"
          className={styles.iconButton}
          aria-label={
            unread
              ? `${t.notifications}: ${t.unreadCount.toLocaleLowerCase(locale)} ${unread}`
              : t.notifications
          }
          title={t.notifications}
        >
          <Bell size={19} strokeWidth={1.75} aria-hidden="true" />
          {unread > 0 && (
            <span className={styles.unreadBadge} aria-hidden="true">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </UiButton>
      </DropdownMenu.Trigger>
      <SystemAdminMenuContent
        className={`${menuStyles.menu} ${styles.notificationsMenu}`}
        aria-label={t.notifications}
        align="end"
        onCloseAutoFocus={menu.onCloseAutoFocus}
        loop
      >
        <div className={menuStyles.menuBody}>
          <DropdownMenu.Label className={styles.menuHeading}>
            {t.notifications}{" "}
            <small>{unread ? `${t.unreadCount}: ${unread}` : t.allRead}</small>
          </DropdownMenu.Label>
          {items.length > 0 && (
            <DropdownMenu.Item
              className={menuStyles.menuItem}
              disabled={!unread}
              onSelect={(event) => {
                event.preventDefault();
                onReadAll();
              }}
            >
              <CheckCheck size={16} aria-hidden="true" />
              {t.readAll}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className={menuStyles.menuSeparator} />
          {items.map((item) => (
            <DropdownMenu.Item
              className={`${menuStyles.menuItem} ${styles.notification}`}
              data-unread={item.unread}
              key={item.id}
              onSelect={() => menu.select(item.onSelect)}
            >
              <span className={styles.notificationIcon}>
                {item.icon ?? <BellRing size={17} aria-hidden="true" />}
              </span>
              <span className={styles.notificationText}>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              {item.unread && (
                <span className={styles.unreadDot} aria-label={t.unread} />
              )}
            </DropdownMenu.Item>
          ))}
          {!items.length && (
            <div className={styles.empty}>
              <Bell size={26} aria-hidden="true" />
              <strong>{t.quiet}</strong>
              <p>{t.notificationsEmpty}</p>
            </div>
          )}
        </div>
      </SystemAdminMenuContent>
    </DropdownMenu.Root>
  );
}
