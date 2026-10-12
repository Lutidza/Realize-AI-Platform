/**
 * @file src/components/admin/system-shell/systemAdminNavigationPreferences.store.ts
 * @version 1.2.1
 * @date 2026-10-12
 * @description Сохраняет настройки меню в браузере и синхронизирует единый снимок между вкладками.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { TemplateNavigationPreferences as SystemAdminNavigationPreferences } from "@realize/template-contracts/react";
import type {
  NavigationPreferencesStorage,
  SystemAdminNavigationPreferencesStore,
} from "./systemAdminNavigationPreferences.types";

export const SYSTEM_ADMIN_NAVIGATION_PREFERENCES_STORAGE_KEY =
  "realize.system-admin.navigation.v1";
const version = 1;

function parsePreferences(
  raw: string | null,
): SystemAdminNavigationPreferences | undefined {
  if (!raw) return undefined;
  try {
    const envelope: unknown = JSON.parse(raw);
    if (
      !envelope ||
      typeof envelope !== "object" ||
      !("version" in envelope) ||
      envelope.version !== version ||
      !("preferences" in envelope)
    )
      return undefined;
    const value = envelope.preferences;
    if (
      !value ||
      typeof value !== "object" ||
      !("order" in value) ||
      !("hidden" in value)
    )
      return undefined;
    if (
      !Array.isArray(value.order) ||
      !value.order.every((id) => typeof id === "string") ||
      !Array.isArray(value.hidden) ||
      !value.hidden.every((id) => typeof id === "string")
    )
      return undefined;
    const preferences: SystemAdminNavigationPreferences = {
      order: value.order,
      hidden: value.hidden,
    };
    // Повреждение нового необязательного поля не сбрасывает валидную компоновку старого меню.
    if (
      "favorites" in value &&
      Array.isArray(value.favorites) &&
      value.favorites.every((id) => typeof id === "string")
    )
      preferences.favorites = value.favorites;
    if (
      "hiddenItems" in value &&
      Array.isArray(value.hiddenItems) &&
      value.hiddenItems.every((id) => typeof id === "string")
    )
      preferences.hiddenItems = value.hiddenItems;
    return preferences;
  } catch {
    return undefined;
  }
}

const browserStorage: NavigationPreferencesStorage = {
  read: () =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(
          SYSTEM_ADMIN_NAVIGATION_PREFERENCES_STORAGE_KEY,
        ),
  write: (serialized) => {
    if (typeof window !== "undefined")
      window.localStorage.setItem(
        SYSTEM_ADMIN_NAVIGATION_PREFERENCES_STORAGE_KEY,
        serialized,
      );
  },
  subscribe: (listener) => {
    if (typeof window === "undefined") return () => undefined;
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== SYSTEM_ADMIN_NAVIGATION_PREFERENCES_STORAGE_KEY
      )
        return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage)
          return;
        listener();
      } catch {
        // Браузер мог отозвать доступ после подписки; локальный снимок остаётся рабочим.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
};

/**
 * Сервер всегда получает undefined. В браузере один store обслуживает все
 * экземпляры shell; отказ storage не уничтожает изменения текущей сессии.
 */
export function createSystemAdminNavigationPreferencesStore(
  storage: NavigationPreferencesStorage = browserStorage,
): SystemAdminNavigationPreferencesStore {
  let snapshot: SystemAdminNavigationPreferences | undefined;
  let initialized = false;
  let memoryOnly = false;
  let disconnect: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (value: SystemAdminNavigationPreferences | undefined) => {
    if (JSON.stringify(snapshot) === JSON.stringify(value)) return;
    snapshot = value;
    for (const listener of listeners) listener();
  };
  const refresh = () => {
    initialized = true;
    try {
      const value = parsePreferences(storage.read());
      memoryOnly = false;
      publish(value);
    } catch {
      memoryOnly = true;
    }
  };
  return {
    getSnapshot() {
      if (!initialized) refresh();
      return snapshot;
    },
    getServerSnapshot: () => undefined,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        disconnect = storage.subscribe(refresh);
        // В период без потребителей другие вкладки могли изменить настройки.
        if (!memoryOnly) refresh();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          disconnect?.();
          disconnect = undefined;
        }
      };
    },
    setPreferences(preferences) {
      const value: SystemAdminNavigationPreferences = {
        order: [...preferences.order],
        hidden: [...preferences.hidden],
        ...(preferences.favorites !== undefined
          ? { favorites: [...preferences.favorites] }
          : {}),
        ...(preferences.hiddenItems !== undefined
          ? { hiddenItems: [...preferences.hiddenItems] }
          : {}),
      };
      initialized = true;
      try {
        storage.write(JSON.stringify({ version, preferences: value }));
        memoryOnly = false;
      } catch {
        memoryOnly = true;
      }
      publish(value);
    },
  };
}
