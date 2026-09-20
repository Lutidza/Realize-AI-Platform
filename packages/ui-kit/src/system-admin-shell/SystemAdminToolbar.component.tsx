/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminToolbar.component.tsx
 * @version 1.2.0
 * @date 2026-09-19
 * @description Собирает общую верхнюю панель приложения из контекста, поиска и действий host.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import { Plus, Sparkles } from "lucide-react";
import { UiButton } from "../button/UiButton.component";
import { SystemAdminActionMenu } from "./SystemAdminActionMenu.component";
import { SystemAdminSearch } from "./SystemAdminSearch.component";
import { SystemAdminNotifications } from "./SystemAdminNotifications.component";
import { SystemAdminProfileMenu } from "./SystemAdminProfileMenu.component";
import { systemAdminMessages } from "./systemAdminLocale.messages";
import type { SystemAdminToolbarProps } from "./SystemAdminToolbar.types";
import styles from "./SystemAdminToolbar.module.css";

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
  return (
    <div className={styles.toolbar} data-system-admin-toolbar>
      <div className={styles.context}>{context}</div>
      <SystemAdminSearch
        entries={searchEntries}
        theme={theme}
        locale={locale}
      />
      <div className={styles.actions}>
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
        ) : (
          <SystemAdminActionMenu
            label={t.create}
            trigger={<Plus size={19} aria-hidden="true" />}
            actions={createActions}
            className={styles.iconButton}
            heading={t.create}
          />
        )}
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
        <SystemAdminNotifications
          items={notifications}
          onReadAll={onReadAll}
          locale={locale}
        />
        <span className={styles.divider} aria-hidden="true" />
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
      </div>
    </div>
  );
}
