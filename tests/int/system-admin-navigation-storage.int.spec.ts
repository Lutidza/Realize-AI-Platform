/**
 * @file tests/int/system-admin-navigation-storage.int.spec.ts
 * @version 1.2.1
 * @date 2026-10-12
 * @description Проверяет сохранение, синхронизацию вкладок, отказ storage и hydration настроек меню.
 * @see documentation/architecture/system-admin-shell.md
 */

import { createElement as h } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSystemAdminNavigationPreferencesStore,
  SYSTEM_ADMIN_NAVIGATION_PREFERENCES_STORAGE_KEY as key,
} from "../../src/components/admin/system-shell/systemAdminNavigationPreferences.store";
import { useSystemAdminNavigationPreferences } from "../../src/components/admin/system-shell/useSystemAdminNavigationPreferences.hook";
import type { SystemAdminNavigationPreferences } from "../../packages/template-realize/src/layouts/admin/systemAdminNavigationPreferences.types";

const saved = { order: ["tasks", "home", "planner"], hidden: ["planner"] };
const serialized = (preferences: SystemAdminNavigationPreferences = saved) =>
  JSON.stringify({ version: 1, preferences });
const emit = (eventKey: string | null = key, newValue: string | null = null) =>
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: eventKey,
      newValue,
      storageArea: window.localStorage,
    }),
  );

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("Browser store настроек системной навигации", () => {
  it("сохраняет hiddenItems в прежнем envelope и читает их в новом store", () => {
    const store = createSystemAdminNavigationPreferencesStore();
    const input = {
      ...saved,
      hiddenItems: ["link:task-location-project-private"],
    };
    store.setPreferences(input);
    const restored =
      createSystemAdminNavigationPreferencesStore().getSnapshot();
    expect(restored).toEqual(input);
    expect(restored?.hiddenItems).not.toBe(input.hiddenItems);
  });
  it("повреждённые hiddenItems не сбрасывают порядок и избранное", () => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        preferences: {
          ...saved,
          favorites: ["section:tasks"],
          hiddenItems: [42],
        },
      }),
    );
    expect(createSystemAdminNavigationPreferencesStore().getSnapshot()).toEqual(
      { ...saved, favorites: ["section:tasks"] },
    );
  });
  it("серверный snapshot не читает storage; browser snapshot стабилен между чтениями", () => {
    const read = vi.fn(() => serialized());
    const store = createSystemAdminNavigationPreferencesStore({
      read,
      write: vi.fn(),
      subscribe: () => () => undefined,
    });
    expect(store.getServerSnapshot()).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
    const snapshot = store.getSnapshot();
    expect(snapshot).toEqual(saved);
    expect(store.getSnapshot()).toBe(snapshot);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each([
    "{broken",
    "null",
    '{"version":2,"preferences":{"order":[],"hidden":[]}}',
    '{"version":1,"preferences":{"order":[42],"hidden":[]}}',
    '{"version":1,"preferences":{"order":[]}}',
  ])("повреждённый или неподдержанный payload не блокирует меню: %s", (raw) => {
    window.localStorage.setItem(key, raw);
    const store = createSystemAdminNavigationPreferencesStore();
    expect(store.getSnapshot()).toBeUndefined();
    store.setPreferences(saved);
    expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual({
      version: 1,
      preferences: saved,
    });
  });

  it("сохраняет новую настройку и подхватывает её в новом экземпляре без мутации входа", () => {
    const store = createSystemAdminNavigationPreferencesStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const input = structuredClone(saved);
    store.setPreferences(input);
    input.order.reverse();
    input.hidden.length = 0;
    expect(store.getSnapshot()).toEqual(saved);
    expect(listener).toHaveBeenCalledTimes(1);
    store.setPreferences(saved);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createSystemAdminNavigationPreferencesStore().getSnapshot()).toEqual(
      saved,
    );
    unsubscribe();
  });

  it("дополняет старый version 1 снимок избранным без смены ключа и потери компоновки", () => {
    window.localStorage.setItem(key, serialized());
    const store = createSystemAdminNavigationPreferencesStore();
    expect(store.getSnapshot()).toEqual(saved);
    const next = {
      ...store.getSnapshot()!,
      favorites: ["section:tasks", "link:task-inbox"],
    };
    store.setPreferences(next);
    expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual({
      version: 1,
      preferences: next,
    });
    expect(createSystemAdminNavigationPreferencesStore().getSnapshot()).toEqual(
      next,
    );
  });

  it.each([null, 42, "section:tasks", {}, ["section:tasks", false]])(
    "повреждённое необязательное favorites не сбрасывает валидные order/hidden: %j",
    (favorites) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ version: 1, preferences: { ...saved, favorites } }),
      );
      expect(
        createSystemAdminNavigationPreferencesStore().getSnapshot(),
      ).toEqual(saved);
    },
  );

  it("клонирует favorites при записи и публикует только изменившийся снимок", () => {
    const store = createSystemAdminNavigationPreferencesStore();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    const input = {
      ...structuredClone(saved),
      favorites: ["section:tasks", "link:task-inbox"],
    };
    const before = structuredClone(input);
    store.setPreferences(input);
    input.favorites.reverse();
    input.favorites.push("section:home");
    expect(store.getSnapshot()).toEqual(before);
    expect(store.getSnapshot()?.favorites).not.toBe(input.favorites);
    store.setPreferences(before);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it("синхронизирует добавление и удаление избранного по актуальному storage другой вкладки", () => {
    const store = createSystemAdminNavigationPreferencesStore();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    const next = { ...saved, favorites: ["section:home"] };
    window.localStorage.setItem(key, serialized(next));
    emit(key, serialized({ ...saved, favorites: ["section:obsolete"] }));
    expect(store.getSnapshot()).toEqual(next);
    window.localStorage.setItem(key, serialized({ ...saved, favorites: [] }));
    emit();
    expect(store.getSnapshot()).toEqual({ ...saved, favorites: [] });
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it("отказ storage сохраняет favorites текущей сессии вместе с компоновкой", () => {
    const store = createSystemAdminNavigationPreferencesStore({
      read: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
      write: () => {
        throw new DOMException("Full", "QuotaExceededError");
      },
      subscribe: () => () => undefined,
    });
    const input = { ...saved, favorites: ["section:tasks"] };
    const stop = store.subscribe(() => undefined);
    store.setPreferences(input);
    stop();
    const resume = store.subscribe(() => undefined);
    expect(store.getSnapshot()).toEqual(input);
    expect(store.getServerSnapshot()).toBeUndefined();
    resume();
  });

  it("синхронизирует storage events по актуальному значению, игнорируя чужие keys и старый payload", () => {
    const store = createSystemAdminNavigationPreferencesStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    window.localStorage.setItem(key, serialized());
    emit("unrelated");
    expect(store.getSnapshot()).toBeUndefined();
    emit(key, serialized({ order: ["obsolete"], hidden: [] }));
    expect(store.getSnapshot()).toEqual(saved);
    expect(listener).toHaveBeenCalledTimes(1);
    emit();
    expect(listener).toHaveBeenCalledTimes(1);
    window.localStorage.removeItem(key);
    emit();
    expect(store.getSnapshot()).toBeUndefined();
    unsubscribe();
  });

  it("clear localStorage сбрасывает настройки, а события sessionStorage не меняют их", () => {
    const store = createSystemAdminNavigationPreferencesStore();
    const unsubscribe = store.subscribe(() => undefined);
    store.setPreferences(saved);
    window.localStorage.setItem(
      key,
      serialized({ order: ["home"], hidden: [] }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key, storageArea: window.sessionStorage }),
    );
    expect(store.getSnapshot()).toEqual(saved);
    window.localStorage.clear();
    emit(null);
    expect(store.getSnapshot()).toBeUndefined();
    unsubscribe();
  });

  it("повторная подписка читает изменения за время отсутствия UI и освобождает storage listener", () => {
    const store = createSystemAdminNavigationPreferencesStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    window.localStorage.setItem(key, serialized());
    emit();
    expect(listener).not.toHaveBeenCalled();
    const stop = store.subscribe(listener);
    expect(store.getSnapshot()).toEqual(saved);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it("отказ чтения и записи сохраняет рабочий снимок при повторном монтировании", () => {
    const read = vi.fn(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const write = vi.fn(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const store = createSystemAdminNavigationPreferencesStore({
      read,
      write,
      subscribe: () => () => undefined,
    });
    expect(store.getSnapshot()).toBeUndefined();
    const unsubscribe = store.subscribe(() => undefined);
    expect(() => store.setPreferences(saved)).not.toThrow();
    expect(store.getSnapshot()).toEqual(saved);
    unsubscribe();
    const stop = store.subscribe(() => undefined);
    expect(store.getSnapshot()).toEqual(saved);
    stop();
  });

  it("hydration сохраняет серверную разметку, затем подключает сохранённые настройки без mismatch", async () => {
    window.localStorage.setItem(key, serialized());
    const recoverable = vi.fn();
    function NavigationConsumer() {
      const { navigationPreferences } = useSystemAdminNavigationPreferences();
      return h(
        "output",
        null,
        navigationPreferences?.order.join(",") ?? "defaults",
      );
    }
    const markup = renderToString(h(NavigationConsumer));
    expect(markup).toContain("defaults");
    const container = document.createElement("div");
    container.innerHTML = markup;
    document.body.append(container);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, h(NavigationConsumer), {
        onRecoverableError: recoverable,
      });
    });
    expect(container.textContent).toBe("tasks,home,planner");
    expect(recoverable).not.toHaveBeenCalled();
    await act(async () => root?.unmount());
    container.remove();
  });
});
