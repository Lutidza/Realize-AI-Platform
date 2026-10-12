/**
 * @file tests/int/system-admin-navigation-preferences.int.spec.ts
 * @version 1.3.1
 * @date 2026-10-12
 * @description Проверяет независимость избранного от компоновки меню и нормализацию текущего каталога.
 * @see documentation/architecture/system-admin-shell.md
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSystemAdminNavigationPreferences as normalize } from "../../packages/template-realize/src/layouts/admin/systemAdminNavigationPreferences.util";
import { useNavigationPreferences } from "../../packages/template-realize/src/layouts/admin/useNavigationPreferences.hook";
import type { SystemAdminNavigationItem } from "../../packages/template-realize/src/layouts/admin/SystemAdminShell.types";
import type { SystemAdminNavigationPreferences } from "../../packages/template-realize/src/layouts/admin/systemAdminNavigationPreferences.types";

const navigation: SystemAdminNavigationItem[] = [
  { id: "home", label: "Главная", icon: null },
  { id: "planner", label: "Планер", icon: null, hiddenByDefault: true },
  {
    id: "tasks",
    label: "Задачи",
    icon: null,
    favoriteable: true,
    groups: [
      {
        id: "task-work",
        label: "Работа",
        items: [
          { id: "task-inbox", label: "Входящие", icon: null, disabled: true },
          {
            id: "task-recent",
            label: "Недавние",
            icon: null,
            shortcuts: [
              {
                id: "task-recent-child",
                label: "Недавний проект",
                icon: null,
                onSelect: () => undefined,
              },
            ],
          },
        ],
      },
    ],
  },
];

afterEach(cleanup);

describe("Нормализация настроек системной навигации", () => {
  it("сохраняет скрытые контейнеры при смене registry и сбросе компоновки", () => {
    const input = {
      order: ["tasks", "home", "planner"],
      hidden: ["planner"],
      hiddenItems: ["link:task-location-project-p-1"],
    };
    expect(normalize([], input).hiddenItems).toEqual(input.hiddenItems);
    const { result } = renderHook(() =>
      useNavigationPreferences({ navigation, navigationPreferences: input }),
    );
    act(() => result.current.resetPreferences());
    expect(result.current.preferences.hiddenItems).toEqual(input.hiddenItems);
  });
  it("использует порядок и скрытые пункты registry до первого сохранения", () => {
    expect(normalize(navigation)).toEqual({
      order: ["home", "planner", "tasks"],
      hidden: ["planner"],
    });
  });

  it("пустой сохранённый hidden оставляет известные пункты явно видимыми", () => {
    expect(
      normalize(navigation, {
        order: ["tasks", "planner", "home"],
        hidden: [],
      }),
    ).toEqual({ order: ["tasks", "planner", "home"], hidden: [] });
  });

  it("удаляет неизвестные и повторные id, не изменяя исходные настройки", () => {
    const preferences = {
      order: ["tasks", "missing", "tasks", "home", "planner"],
      hidden: ["missing", "home", "home"],
    };
    const before = structuredClone(preferences);
    expect(normalize(navigation, preferences)).toEqual({
      order: ["tasks", "home", "planner"],
      hidden: ["home"],
    });
    expect(preferences).toEqual(before);
  });

  it("дописывает новые разделы после пользовательского порядка и применяет только их defaults", () => {
    const expanded = [
      ...navigation,
      {
        id: "workshop",
        label: "Мастерская",
        icon: null,
        hiddenByDefault: true,
      },
      { id: "analytics", label: "Аналитика", icon: null },
    ];
    expect(
      normalize(expanded, { order: ["tasks", "planner", "home"], hidden: [] }),
    ).toEqual({
      order: ["tasks", "planner", "home", "workshop", "analytics"],
      hidden: ["workshop"],
    });
  });

  it("изменение registry default не отменяет выбор видимости уже известного раздела", () => {
    const changed = navigation.map((item) => ({
      ...item,
      hiddenByDefault: true,
    }));
    expect(
      normalize(changed, {
        order: ["home", "planner", "tasks"],
        hidden: ["tasks"],
      }),
    ).toEqual({ order: ["home", "planner", "tasks"], hidden: ["tasks"] });
  });

  it("нормализация идемпотентна и сохраняет скрытие всех разделов", () => {
    const once = normalize(navigation, {
      order: ["tasks", "home", "planner"],
      hidden: ["planner", "tasks", "home"],
    });
    expect(normalize(navigation, once)).toEqual(once);
    expect(once.hidden).toEqual(once.order);
  });

  it("пустой доступный каталог не раскрывает удалённые пункты из storage", () => {
    expect(
      normalize([], { order: ["home", "planner"], hidden: ["planner"] }),
    ).toEqual({ order: [], hidden: [] });
  });

  it("старые снимки остаются валидны без добавления необязательного favorites", () => {
    const legacy = { order: ["tasks", "home", "planner"], hidden: ["planner"] };
    expect(normalize(navigation, legacy)).toEqual(legacy);
    expect(normalize(navigation, legacy)).not.toHaveProperty("favorites");
  });

  it("сохраняет порядок избранного, фильтрует неизвестные и повторные ID без мутации входа", () => {
    const input = {
      order: ["tasks", "home", "planner"],
      hidden: ["home", "tasks"],
      favorites: [
        "link:task-recent-child",
        "section:tasks",
        "link:missing",
        "section:tasks",
        "link:task-inbox",
        "section:home",
        "home",
      ],
    };
    const before = structuredClone(input);
    const normalized = normalize(navigation, input);
    expect(normalized).toEqual({
      order: input.order,
      hidden: ["tasks", "home"],
      favorites: ["link:task-recent-child", "section:tasks"],
    });
    expect(input).toEqual(before);
    expect(normalized.favorites).not.toBe(input.favorites);
    expect(normalize(navigation, normalized)).toEqual(normalized);
  });

  it("удалённые targets исчезают, а скрытие раздела не меняет его избранные ссылки", () => {
    const input = {
      order: ["home", "planner", "tasks"],
      hidden: ["tasks"],
      favorites: ["section:tasks", "link:task-recent-child"],
    };
    expect(normalize(navigation, input).favorites).toEqual(input.favorites);
    expect(
      normalize(
        navigation.filter((item) => item.id !== "tasks"),
        input,
      ).favorites,
    ).toEqual([]);
    expect(normalize([], input)).toEqual({
      order: [],
      hidden: [],
      favorites: [],
    });
  });

  it("локальные toggle, видимость и reset сохраняют независимость настроек", () => {
    const { result } = renderHook(() =>
      useNavigationPreferences({
        navigation,
        navigationPreferences: {
          order: ["tasks", "planner", "home"],
          hidden: ["planner", "home"],
        },
      }),
    );
    act(() => result.current.toggleFavorite("section:tasks"));
    act(() => result.current.toggleFavorite("link:task-recent-child"));
    expect(result.current.preferences).toEqual({
      order: ["tasks", "planner", "home"],
      hidden: ["planner", "home"],
      favorites: ["section:tasks", "link:task-recent-child"],
    });
    act(() => result.current.showItem("home"));
    expect(result.current.preferences.hidden).toEqual(["planner"]);
    expect(result.current.preferences.favorites).toEqual([
      "section:tasks",
      "link:task-recent-child",
    ]);
    act(() =>
      result.current.updatePreferences({
        ...result.current.preferences,
        order: ["planner", "tasks", "home"],
        hidden: [],
      }),
    );
    act(() => result.current.resetPreferences());
    expect(result.current.preferences).toEqual({
      order: ["home", "planner", "tasks"],
      hidden: ["planner"],
      favorites: ["section:tasks", "link:task-recent-child"],
    });
    act(() => result.current.toggleFavorite("section:tasks"));
    expect(result.current.preferences.favorites).toEqual([
      "link:task-recent-child",
    ]);
    const before = result.current.preferences;
    act(() => result.current.toggleFavorite("link:unknown"));
    act(() => result.current.toggleFavorite("section:home"));
    act(() => result.current.toggleFavorite("link:task-inbox"));
    expect(result.current.preferences).toBe(before);
  });

  it("controlled hook передаёт один полный снимок host и не добавляет неизвестное избранное", () => {
    const onChange = vi.fn();
    const initial: SystemAdminNavigationPreferences = {
      order: ["tasks", "home", "planner"],
      hidden: ["home"],
    };
    const { result, rerender } = renderHook(
      (preferences: SystemAdminNavigationPreferences) =>
        useNavigationPreferences({
          navigation,
          navigationPreferences: preferences,
          onNavigationPreferencesChange: onChange,
        }),
      { initialProps: initial },
    );
    act(() => result.current.toggleFavorite("link:unknown"));
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.toggleFavorite("link:task-recent-child"));
    const next = { ...initial, favorites: ["link:task-recent-child"] };
    expect(onChange).toHaveBeenLastCalledWith(next);
    expect(initial).not.toHaveProperty("favorites");
    rerender(next);
    act(() => result.current.resetPreferences());
    expect(onChange).toHaveBeenLastCalledWith({
      order: ["home", "planner", "tasks"],
      hidden: ["planner"],
      favorites: next.favorites,
    });
  });
});
