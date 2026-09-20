/**
 * @file src/components/admin/system-shell/useSystemAdminLocale.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Подключает сохранённый язык каркаса без расхождения серверной разметки.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import { useSyncExternalStore } from "react";
import { systemAdminLocaleStore } from "./systemAdminLocale.store";

export function useSystemAdminLocale() {
  const locale = useSyncExternalStore(
    systemAdminLocaleStore.subscribe,
    systemAdminLocaleStore.getSnapshot,
    systemAdminLocaleStore.getServerSnapshot,
  );
  return { locale, setLocale: systemAdminLocaleStore.setLocale };
}
