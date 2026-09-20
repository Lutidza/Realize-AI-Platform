/**
 * @file src/components/admin/system-shell/systemAdminNavigationPreferences.types.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Описывает browser storage и подписку на персональные настройки навигации.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { SystemAdminNavigationPreferences } from "@realize/ui-kit";

export type SystemAdminNavigationPreferencesBinding = {
  navigationPreferences: SystemAdminNavigationPreferences | undefined;
  onNavigationPreferencesChange: (
    preferences: SystemAdminNavigationPreferences,
  ) => void;
};

/** Адаптер уведомляет об изменении, а store перечитывает актуальное значение, не устаревший event payload. */
export type NavigationPreferencesStorage = {
  read: () => string | null;
  write: (serialized: string) => void;
  subscribe: (listener: () => void) => () => void;
};

export type SystemAdminNavigationPreferencesStore = {
  getSnapshot: () => SystemAdminNavigationPreferences | undefined;
  getServerSnapshot: () => undefined;
  subscribe: (listener: () => void) => () => void;
  setPreferences: (preferences: SystemAdminNavigationPreferences) => void;
};
