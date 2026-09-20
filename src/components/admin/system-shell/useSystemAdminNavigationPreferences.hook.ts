/**
 * @file src/components/admin/system-shell/useSystemAdminNavigationPreferences.hook.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Подписывает системную оболочку на настройки навигации без расхождения серверной разметки.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import { useSyncExternalStore } from "react";
import { createSystemAdminNavigationPreferencesStore } from "./systemAdminNavigationPreferences.store";
import type { SystemAdminNavigationPreferencesBinding } from "./systemAdminNavigationPreferences.types";

const store = createSystemAdminNavigationPreferencesStore();

/** Hydration начинает с серверного snapshot, затем React синхронно подхватывает browser preferences. */
export function useSystemAdminNavigationPreferences(): SystemAdminNavigationPreferencesBinding {
  const navigationPreferences = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return {
    navigationPreferences,
    onNavigationPreferencesChange: store.setPreferences,
  };
}
