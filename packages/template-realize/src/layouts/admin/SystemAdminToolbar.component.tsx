/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminToolbar.component.tsx
 * @version 1.3.0
 * @date 2026-10-12
 * @description Собирает общую верхнюю панель приложения из контекста, поиска и действий host.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import { Moon, Plus, Sparkles, Sun } from "lucide-react";
import { UiButton } from "@realize/ui-kit";
import { SystemAdminActionMenu } from "./SystemAdminActionMenu.component";
import { SystemAdminSearch } from "./SystemAdminSearch.component";
import { SystemAdminNotifications } from "./SystemAdminNotifications.component";
import { SystemAdminProfileMenu } from "./SystemAdminProfileMenu.component";
import { systemAdminMessages } from "./systemAdminLocale.messages";
import type { SystemAdminToolbarProps } from "./SystemAdminToolbar.types";
import styles from "./SystemAdminToolbar.module.css";

/** Отсутствующие возможности host не создают пустые группы или фиктивные действия. */
export function SystemAdminToolbar({
  context,
  theme,
  onThemeChange,
  searchEntries,
  createActions,
  notifications,
  onReadAll,
  onAssistant,
  user,
  profileActions,
  billingActions,
  signOutAction,
  onCreate,
  locale = "ru",
  onLocaleChange,
}: SystemAdminToolbarProps) {
  const t = systemAdminMessages[locale];
  const hasPrimaryActions = Boolean(
    onCreate ||
    createActions !== undefined ||
    onAssistant ||
    (notifications !== undefined && onReadAll),
  );
  const hasProfile = user !== undefined && profileActions !== undefined;
  const hasStandaloneMode = Boolean(onThemeChange) && !hasProfile;
  const hasActions = hasPrimaryActions || hasProfile || hasStandaloneMode;
  return (
    <div className={styles.toolbar} data-system-admin-toolbar>
      <div className={styles.context}>{context}</div>
      {searchEntries !== undefined && (
        <SystemAdminSearch
          entries={searchEntries}
          theme={theme}
          locale={locale}
        />
      )}
      {hasActions && (
        <div className={styles.actions}>
          {hasStandaloneMode && onThemeChange && (
            <UiButton
              variant="ghost"
              size="icon"
              className={styles.iconButton}
              aria-label={theme === "dark" ? t.light : t.dark}
              title={theme === "dark" ? t.light : t.dark}
              onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun size={17} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
            </UiButton>
          )}
          {onCreate ? (
            <UiButton
              variant="ghost"
              size="icon"
              className={styles.iconButton}
              onClick={onCreate}
              aria-label={t.create}
              title={t.create}
            >
              <Plus size={19} aria-hidden="true" />
            </UiButton>
          ) : createActions !== undefined ? (
            <SystemAdminActionMenu
              label={t.create}
              trigger={<Plus size={19} aria-hidden="true" />}
              actions={createActions}
              className={styles.iconButton}
              heading={t.create}
            />
          ) : null}
          {onAssistant && (
            <UiButton
              variant="ghost"
              className={styles.assistantButton}
              onClick={onAssistant}
              aria-label={t.openAssistant}
              title={t.openAssistant}
            >
              <Sparkles size={17} aria-hidden="true" />
              <span>{t.assistant}</span>
            </UiButton>
          )}
          {notifications !== undefined && onReadAll && (
            <SystemAdminNotifications
              items={notifications}
              onReadAll={onReadAll}
              locale={locale}
            />
          )}
          {hasPrimaryActions && user && profileActions !== undefined && (
            <span className={styles.divider} aria-hidden="true" />
          )}
          {user && profileActions !== undefined && (
            <SystemAdminProfileMenu
              user={user}
              profileActions={profileActions}
              billingActions={billingActions}
              signOutAction={signOutAction}
              theme={theme}
              onThemeChange={onThemeChange}
              locale={locale}
              onLocaleChange={onLocaleChange}
            />
          )}
        </div>
      )}
    </div>
  );
}
