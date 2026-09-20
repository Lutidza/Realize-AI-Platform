/**
 * @file src/components/admin/system-shell/systemAdminLocale.store.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Сохраняет язык каркаса в браузере и синхронизирует его между экземплярами и вкладками.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { SystemAdminLocale } from "@realize/ui-kit";

const storageKey = "realize.system-admin.locale";
const changeEvent = "realize:system-admin-locale";
let snapshot: SystemAdminLocale = "ru";
let initialized = false;

function refresh() {
  if (typeof window === "undefined") return;
  initialized = true;
  try {
    snapshot = window.localStorage.getItem(storageKey) === "en" ? "en" : "ru";
  } catch {
    // Запрет storage сохраняет рабочее предпочтение текущей вкладки.
  }
}

/** Server snapshot постоянен; переключение в памяти работает и при отказе storage. */
export const systemAdminLocaleStore = {
  getServerSnapshot: (): SystemAdminLocale => "ru",
  getSnapshot: () => {
    if (!initialized) refresh();
    return snapshot;
  },
  subscribe: (listener: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== storageKey) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage)
          return;
        refresh();
        listener();
      } catch {
        // Storage может стать недоступен уже после установки подписки.
      }
    };
    window.addEventListener(changeEvent, listener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(changeEvent, listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  setLocale: (locale: SystemAdminLocale) => {
    snapshot = locale;
    initialized = true;
    try {
      window.localStorage.setItem(storageKey, locale);
    } catch {
      // Выбор применяется без persistence, не прерывая работу интерфейса.
    }
    window.dispatchEvent(new Event(changeEvent));
  },
};
