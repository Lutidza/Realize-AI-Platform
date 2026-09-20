/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminToolbar.types.ts
 * @version 1.2.0
 * @date 2026-09-19
 * @description Определяет независимые от приложения действия, поиск и уведомления верхней панели.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { ReactNode } from "react";
import type { SystemAdminLocale } from "./systemAdminLocale.types";

/** Host передаёт только разрешённые действия и сам проверяет переход/изменение данных. */
export type SystemAdminToolbarAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
};
export type SystemAdminSearchEntry = SystemAdminToolbarAction & {
  group: string;
  description?: string;
  keywords?: string;
};
export type SystemAdminNotification = SystemAdminToolbarAction & {
  description: string;
  unread: boolean;
};
export type SystemAdminActionMenuProps = {
  label: string;
  trigger: ReactNode;
  actions: SystemAdminToolbarAction[];
  heading?: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
};
export type SystemAdminSearchProps = {
  entries: SystemAdminSearchEntry[];
  theme: "light" | "dark";
  locale?: SystemAdminLocale;
};
export type SystemAdminNotificationsProps = {
  items: SystemAdminNotification[];
  onReadAll: () => void;
  locale?: SystemAdminLocale;
};
export type SystemAdminToolbarProps = {
  context: ReactNode;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  searchEntries: SystemAdminSearchEntry[];
  createActions: SystemAdminToolbarAction[];
  notifications: SystemAdminNotification[];
  onReadAll: () => void;
  onAssistant: () => void;
  user: { name: string; initials: string; description?: string };
  profileActions: SystemAdminToolbarAction[];
  billingActions?: SystemAdminToolbarAction[];
  signOutAction?: SystemAdminToolbarAction;
  /** Полная форма host; без обработчика остаётся меню createActions. */
  onCreate?: () => void;
  locale?: SystemAdminLocale;
  onLocaleChange?: (locale: SystemAdminLocale) => void;
};

export type SystemAdminProfileMenuProps = Pick<
  SystemAdminToolbarProps,
  | "user"
  | "profileActions"
  | "billingActions"
  | "signOutAction"
  | "theme"
  | "onThemeChange"
  | "locale"
  | "onLocaleChange"
>;
export type SystemAdminShortcutHelpProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: "light" | "dark";
  locale: SystemAdminLocale;
};
