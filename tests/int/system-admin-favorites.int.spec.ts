/**
 * @file tests/int/system-admin-favorites.int.spec.ts
 * @version 1.4.1
 * @date 2026-10-12
 * @description Проверяет закрепление, действия со ссылкой и жизненный цикл меню системной навигации.
 * @see documentation/architecture/system-admin-shell.md
 */

import { createElement as h } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemAdminNavigation } from "../../packages/template-realize/src/layouts/admin/SystemAdminNavigation.component";
import { SystemAdminItemMenu } from "../../packages/template-realize/src/layouts/admin/SystemAdminItemMenu.component";
import type {
  SystemAdminNavigationItem,
  SystemAdminNavigationLink,
} from "../../packages/template-realize/src/layouts/admin/SystemAdminShell.types";
import type { SystemAdminNavigationPreferences } from "../../packages/template-realize/src/layouts/admin/systemAdminNavigationPreferences.types";
import { getSystemAdminFavoriteTargets } from "../../packages/template-realize/src/layouts/admin/systemAdminFavorites.util";

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
const clipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function advance(milliseconds = 120) {
  act(() => vi.advanceTimersByTime(milliseconds));
}

function openSection(label: string, mobile = false) {
  if (mobile) {
    const back = screen.queryByRole("button", { name: "К разделам" });
    if (back) fireEvent.click(back);
  }
  const trigger = within(
    screen.getByRole("navigation", { name: "Разделы системы" }),
  ).getByRole("button", { name: label });
  if (mobile) fireEvent.click(trigger);
  else {
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    fireEvent.mouseEnter(trigger);
  }
  advance();
  return screen.getByRole(mobile ? "region" : "dialog", {
    name: label,
  });
}

function openItemMenu(container: HTMLElement, label: string) {
  const trigger = within(container).getByRole("button", {
    name: `Действия: ${label}`,
  });
  act(() => trigger.focus());
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  advance(20);
  return screen.getByRole("menu", { name: `Действия: ${label}` });
}

function chooseFavorite(container: HTMLElement, label: string, remove = false) {
  const menu = openItemMenu(container, label);
  fireEvent.click(
    within(menu).getByRole("menuitem", {
      name: remove ? "Убрать из избранного" : "Добавить в избранное",
    }),
  );
  advance(20);
  expect(screen.queryByRole("menu")).toBeNull();
}

function fixture({
  mobile = false,
  favorites = [] as string[],
  sectionFavoriteable = false,
  queueHref = undefined as string | undefined,
  queueFavoriteable = undefined as boolean | undefined,
} = {}) {
  const openQueue = vi.fn();
  const openUnavailable = vi.fn();
  const openAi = vi.fn();
  const onNavigate = vi.fn();
  let preferences: SystemAdminNavigationPreferences = {
    order: ["ai", "home", "workshop"],
    hidden: ["workshop"],
    favorites,
  };
  const navigation: SystemAdminNavigationItem[] = [
    {
      id: "home",
      label: "Главная",
      icon: null,
      groups: [
        {
          id: "personal",
          label: "Моё пространство",
          items: [
            {
              id: "favorites",
              label: "Избранное",
              icon: null,
              favoritesSlot: true,
            },
          ],
        },
      ],
    },
    {
      id: "ai",
      label: "AI",
      icon: null,
      favoriteable: sectionFavoriteable,
      onSelect: openAi,
      groups: [
        {
          id: "execution",
          label: "Выполнение",
          items: [
            {
              id: "queue",
              label: "Очередь",
              icon: null,
              onSelect: openQueue,
              href: queueHref,
              favoriteable: queueFavoriteable,
            },
            {
              id: "blocked",
              label: "Недоступный раздел",
              icon: null,
              href: "/admin/restricted",
              onSelect: openUnavailable,
              disabled: true,
            },
          ],
        },
      ],
    },
    { id: "workshop", label: "Мастерская", icon: null },
  ];
  const onChange = vi.fn((next: SystemAdminNavigationPreferences) => {
    preferences = next;
    rendered.rerender(element());
  });
  const element = () =>
    h(SystemAdminNavigation, {
      key: mobile ? "mobile" : "desktop",
      navigation,
      navigationPreferences: preferences,
      onNavigationPreferencesChange: onChange,
      activeNavigationId: "home",
      onNavigate,
      mobile,
      theme: "light",
    });
  const rendered = render(element());
  return {
    openQueue,
    openUnavailable,
    openAi,
    onNavigate,
    onChange,
    preferences: () => preferences,
    remount: (nextMobile: boolean) => {
      mobile = nextMobile;
      rendered.rerender(element());
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // JSDOM не измеряет стрелку Radix Popper через ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // JSDOM не рассчитывает прокрутку мобильной панели.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (scrollIntoViewDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      scrollIntoViewDescriptor,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  if (clipboardDescriptor)
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("Избранное системной навигации", () => {
  it("открывает host actions без favorite target и не вызывает disabled действие", () => {
    const create = vi.fn();
    const disabled = vi.fn();
    const ui = render(
      h(SystemAdminItemMenu, {
        label: "Разделы",
        alwaysVisible: true,
        actions: [
          { id: "create", label: "Создать список", onSelect: create },
          {
            id: "disabled",
            label: "Недоступно",
            onSelect: disabled,
            disabled: true,
          },
        ],
      }),
    );
    const menu = openItemMenu(ui.container, "Разделы");
    expect(within(menu).queryByText("Добавить в избранное")).toBeNull();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Недоступно" }));
    expect(disabled).not.toHaveBeenCalled();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Создать список" }),
    );
    advance(20);
    expect(create).toHaveBeenCalledOnce();
  });
  it("открывает меню действий без изменения избранного или перехода и удерживает hover-панель при фокусе внутри", () => {
    const result = fixture();
    const panel = openSection("AI");
    const menu = openItemMenu(panel, "Очередь");
    expect(
      within(menu).getByRole("menuitem", { name: "Добавить в избранное" }),
    ).toBeTruthy();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    fireEvent.pointerLeave(panel, { pointerType: "mouse" });
    advance(300);
    expect(screen.getByRole("dialog", { name: "AI" })).toBe(panel);
    expect(screen.getByRole("menu", { name: "Действия: Очередь" })).toBe(menu);
    expect(result.preferences()).toEqual({
      order: ["ai", "home", "workshop"],
      hidden: ["workshop"],
      favorites: [],
    });
    expect(result.onChange).not.toHaveBeenCalled();
    expect(result.openQueue).not.toHaveBeenCalled();
    expect(result.onNavigate).not.toHaveBeenCalled();
  });

  it.each(["hover", "pinned"] as const)(
    "первый Escape закрывает только меню действий, второй — панель %s",
    (mode) => {
      const result = fixture();
      const panel = openSection("AI");
      if (mode === "pinned") {
        fireEvent.click(screen.getByRole("button", { name: "Раскрыть меню" }));
        advance(20);
      }
      const trigger = within(panel).getByRole("button", {
        name: "Действия: Очередь",
      });
      const menu = openItemMenu(panel, "Очередь");
      fireEvent.keyDown(
        within(menu).getByRole("menuitem", { name: "Добавить в избранное" }),
        { key: "Escape" },
      );
      advance(20);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(screen.getByRole("dialog", { name: "AI" })).toBe(panel);
      expect(document.activeElement).toBe(trigger);
      expect(result.onChange).not.toHaveBeenCalled();
      fireEvent.keyDown(trigger, { key: "Escape" });
      advance(20);
      expect(screen.queryByRole("dialog", { name: "AI" })).toBeNull();
      expect(document.activeElement).toBe(
        within(
          screen.getByRole("navigation", { name: "Разделы системы" }),
        ).getByRole("button", { name: "AI" }),
      );
    },
  );

  it("закрепляет и открепляет подпункт без перехода, закрытия панели и изменения её порядка или видимости", () => {
    const result = fixture();
    const panel = openSection("AI");
    chooseFavorite(panel, "Очередь");
    expect(result.preferences()).toEqual({
      order: ["ai", "home", "workshop"],
      hidden: ["workshop"],
      favorites: ["link:queue"],
    });
    expect(screen.getByRole("dialog", { name: "AI" })).toBe(panel);
    chooseFavorite(panel, "Очередь", true);
    expect(result.preferences()).toEqual({
      order: ["ai", "home", "workshop"],
      hidden: ["workshop"],
      favorites: [],
    });
    expect(screen.getByRole("dialog", { name: "AI" })).toBe(panel);
    expect(result.openQueue).not.toHaveBeenCalled();
    expect(result.openAi).not.toHaveBeenCalled();
    expect(result.onNavigate).not.toHaveBeenCalled();
  });

  it("не предлагает закреплять недоступный подпункт и очищает его старое избранное", () => {
    const result = fixture({ favorites: ["link:blocked", "section:ai"] });
    const panel = openSection("AI");
    expect(
      within(panel).queryByRole("button", {
        name: "Действия: Недоступный раздел",
      }),
    ).toBeNull();
    expect(
      within(panel).queryByRole("button", { name: "Действия: AI" }),
    ).toBeNull();
    const blocked = within(panel).getByRole("button", {
      name: "Недоступный раздел",
    });
    expect(blocked.hasAttribute("disabled")).toBe(true);
    fireEvent.click(blocked);
    openSection("Главная");
    const favorites = screen.getByRole("region", {
      name: "Закреплённые пункты",
    });
    expect(
      within(favorites).queryByRole("link", { name: "Недоступный раздел" }),
    ).toBeNull();
    expect(
      within(favorites).queryByRole("button", {
        name: "Недоступный раздел",
      }),
    ).toBeNull();
    expect(favorites.textContent).toContain("Откройте меню «…»");
    expect(result.openUnavailable).not.toHaveBeenCalled();
    expect(result.onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Главная" })).toBeTruthy();
  });

  it.each(["hover", "pinned", "mobile"] as const)(
    "переход по избранному соблюдает lifecycle %s",
    (mode) => {
      const mobile = mode === "mobile";
      const result = fixture({ mobile, favorites: ["link:queue"] });
      const panel = openSection("Главная", mobile);
      if (mode === "pinned") {
        fireEvent.click(screen.getByRole("button", { name: "Раскрыть меню" }));
        advance(20);
      }
      const favorites = screen.getByRole("region", {
        name: "Закреплённые пункты",
      });
      fireEvent.click(
        within(favorites).getByRole("button", { name: "Очередь" }),
      );
      expect(result.openQueue).toHaveBeenCalledTimes(1);
      expect(result.onNavigate).toHaveBeenCalledTimes(1);
      if (mode === "pinned")
        expect(screen.getByRole("dialog", { name: "Главная" })).toBe(panel);
      else
        expect(
          screen.queryByRole(mobile ? "region" : "dialog", {
            name: "Главная",
          }),
        ).toBeNull();
    },
  );

  it("сохраняет controlled выбор после remount desktop/mobile и обратного перехода", () => {
    const result = fixture();
    const panel = openSection("AI");
    chooseFavorite(panel, "Очередь");
    result.remount(true);
    openSection("Главная", true);
    let favorites = screen.getByRole("region", { name: "Закреплённые пункты" });
    expect(
      within(favorites).getByRole("button", { name: "Очередь" }),
    ).toBeTruthy();
    chooseFavorite(favorites, "Очередь", true);
    result.remount(false);
    openSection("Главная");
    favorites = screen.getByRole("region", { name: "Закреплённые пункты" });
    expect(
      within(favorites).queryByRole("button", { name: "Очередь" }),
    ).toBeNull();
    expect(favorites.textContent).toContain("Откройте меню «…»");
    expect(result.preferences().favorites).toEqual([]);
    expect(result.onChange).toHaveBeenCalledTimes(2);
  });

  it("возвращает focus на область избранного после удаления последней сфокусированной строки", () => {
    const result = fixture({ favorites: ["link:queue"] });
    const panel = openSection("Главная");
    const favorites = screen.getByRole("region", {
      name: "Закреплённые пункты",
    });
    const remove = within(favorites).getByRole("button", {
      name: "Действия: Очередь",
    });
    chooseFavorite(favorites, "Очередь", true);
    expect(remove.isConnected).toBe(false);
    expect(document.activeElement).toBe(favorites);
    expect(favorites.textContent).toContain("Откройте меню «…»");
    expect(screen.getByRole("dialog", { name: "Главная" })).toBe(panel);
    expect(result.onNavigate).not.toHaveBeenCalled();
  });

  it("закреплённый верхний раздел открывает flyout без выполнения команды раздела", () => {
    const result = fixture({ sectionFavoriteable: true });
    const panel = openSection("AI");
    chooseFavorite(panel, "AI");
    expect(result.preferences().favorites).toEqual(["section:ai"]);
    openSection("Главная");
    const favorites = screen.getByRole("region", {
      name: "Закреплённые пункты",
    });
    fireEvent.click(within(favorites).getByRole("button", { name: "AI" }));
    advance(20);
    expect(screen.getByRole("dialog", { name: "AI" })).toBeTruthy();
    expect(result.openAi).not.toHaveBeenCalled();
    expect(result.onNavigate).not.toHaveBeenCalled();
  });
});

describe("Действия со ссылкой в меню навигации", () => {
  it("предлагает действия в заданном порядке без видимого заголовка и открывает URL нативной ссылкой в новой вкладке", () => {
    const result = fixture({
      queueHref: "/admin/process-runs?status=queued#active",
    });
    const menu = openItemMenu(openSection("AI"), "Очередь");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Добавить в избранное",
      "Открыть в новой вкладке",
      "Копировать ссылку",
    ]);
    expect(within(menu).queryByText("Очередь")).toBeNull();
    const openLink = within(menu).getByRole("menuitem", {
      name: "Открыть в новой вкладке",
    });
    expect(openLink.tagName).toBe("A");
    expect(openLink.getAttribute("href")).toBe(
      "/admin/process-runs?status=queued#active",
    );
    expect(openLink.getAttribute("target")).toBe("_blank");
    expect(openLink.getAttribute("rel")?.split(" ")).toEqual(
      expect.arrayContaining(["noopener", "noreferrer"]),
    );
    expect(result.openQueue).not.toHaveBeenCalled();
    expect(result.onNavigate).not.toHaveBeenCalled();
    expect(result.onChange).not.toHaveBeenCalled();
  });

  it("сохраняет действия со ссылкой, когда закрепление пункта запрещено", () => {
    fixture({ queueHref: "/admin/settings", queueFavoriteable: false });
    const menu = openItemMenu(openSection("AI"), "Очередь");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Открыть в новой вкладке", "Копировать ссылку"]);
  });

  it("копирует полный URL с query и hash, блокируя повторный запрос до подтверждения Clipboard", async () => {
    let complete!: () => void;
    const writeText = vi.fn(
      () => new Promise<void>((resolve) => (complete = resolve)),
    );
    mockClipboard(writeText);
    const result = fixture({
      queueHref: "/admin/process-runs?status=queued#active",
    });
    const panel = openSection("AI");
    const menu = openItemMenu(panel, "Очередь");
    const copy = within(menu).getByRole("menuitem", {
      name: "Копировать ссылку",
    });
    await act(async () => fireEvent.click(copy));
    expect(writeText).toHaveBeenCalledWith(
      new URL("/admin/process-runs?status=queued#active", window.location.href)
        .href,
    );
    expect(copy.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menu")).toBe(menu);
    expect(within(menu).queryByRole("status")).toBeNull();
    await act(async () => complete());
    expect(within(menu).getByRole("status").textContent).toBe(
      "Ссылка скопирована.",
    );
    expect(copy.getAttribute("aria-disabled")).not.toBe("true");
    expect(screen.getByRole("dialog", { name: "AI" })).toBe(panel);
    expect(result.openQueue).not.toHaveBeenCalled();
    expect(result.onNavigate).not.toHaveBeenCalled();
    expect(result.onChange).not.toHaveBeenCalled();
  });

  it("показывает отказ Clipboard и разрешает повторить копирование без закрытия меню", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Clipboard permission denied"))
      .mockResolvedValueOnce(undefined);
    mockClipboard(writeText);
    fixture({ queueHref: "https://example.com/work?project=1#queue" });
    const menu = openItemMenu(openSection("AI"), "Очередь");
    const copy = within(menu).getByRole("menuitem", {
      name: "Копировать ссылку",
    });
    await act(async () => fireEvent.click(copy));
    expect(within(menu).getByRole("status").textContent).toBe(
      "Не удалось скопировать ссылку. Повторите попытку.",
    );
    expect(copy.getAttribute("aria-disabled")).not.toBe("true");
    await act(async () => fireEvent.click(copy));
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenLastCalledWith(
      "https://example.com/work?project=1#queue",
    );
    expect(within(menu).getByRole("status").textContent).toBe(
      "Ссылка скопирована.",
    );
    expect(screen.getByRole("menu")).toBe(menu);
  });

  it("сообщает об отсутствии Clipboard API вместо ложного подтверждения копирования", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    fixture({ queueHref: "/admin/process-runs" });
    const menu = openItemMenu(openSection("AI"), "Очередь");
    await act(async () =>
      fireEvent.click(
        within(menu).getByRole("menuitem", { name: "Копировать ссылку" }),
      ),
    );
    expect(within(menu).getByRole("status").textContent).toBe(
      "Не удалось скопировать ссылку. Повторите попытку.",
    );
  });

  it("игнорирует завершение копирования из закрытого меню, сохраняя новый запрос после повторного открытия", async () => {
    let completeFirst!: () => void;
    let completeSecond!: () => void;
    const writeText = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (completeFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (completeSecond = resolve)),
      );
    mockClipboard(writeText);
    fixture({ queueHref: "/admin/process-runs" });
    const panel = openSection("AI");
    let menu = openItemMenu(panel, "Очередь");
    let copy = within(menu).getByRole("menuitem", {
      name: "Копировать ссылку",
    });
    await act(async () => fireEvent.click(copy));
    fireEvent.keyDown(menu, { key: "Escape" });
    advance(20);
    expect(screen.queryByRole("menu")).toBeNull();
    menu = openItemMenu(panel, "Очередь");
    copy = within(menu).getByRole("menuitem", { name: "Копировать ссылку" });
    expect(within(menu).queryByRole("status")).toBeNull();
    expect(copy.getAttribute("aria-disabled")).not.toBe("true");
    await act(async () => fireEvent.click(copy));
    expect(writeText).toHaveBeenCalledTimes(2);
    await act(async () => completeFirst());
    expect(within(menu).queryByRole("status")).toBeNull();
    expect(copy.getAttribute("aria-disabled")).toBe("true");
    await act(async () => completeSecond());
    expect(within(menu).getByRole("status").textContent).toBe(
      "Ссылка скопирована.",
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "mailto:operator@example.com",
  ])("не предлагает действия со ссылкой протокола вне http(s): %s", (href) => {
    fixture({ queueHref: href, queueFavoriteable: false });
    const panel = openSection("AI");
    expect(
      within(panel).queryByRole("button", { name: "Действия: Очередь" }),
    ).toBeNull();
  });
});

describe("Доступность назначений избранного", () => {
  it("исключает недоступные, служебные и пустые пункты, независимо сохраняя рабочие shortcuts", () => {
    const link = (
      id: string,
      extra: Partial<SystemAdminNavigationLink> = {},
    ): SystemAdminNavigationLink => ({
      id,
      label: id,
      icon: null,
      href: `/admin/${id}`,
      ...extra,
    });
    const navigation: SystemAdminNavigationItem[] = [
      {
        id: "section",
        label: "Раздел",
        icon: null,
        groups: [
          {
            id: "group",
            label: "Группа",
            items: [
              link("url"),
              link("action", { href: undefined, onSelect: vi.fn() }),
              link("disabled", {
                disabled: true,
                shortcuts: [link("disabled-child")],
              }),
              link("service", {
                favoriteable: false,
                shortcuts: [link("service-child")],
              }),
              link("favorites", {
                favoritesSlot: true,
                shortcuts: [link("favorites-child")],
              }),
              link("empty", { href: undefined, favoriteable: true }),
            ],
          },
        ],
        favoriteLinks: [
          link("custom"),
          link("url"),
          link("custom-disabled", { disabled: true }),
        ],
      },
    ];
    expect(
      getSystemAdminFavoriteTargets(navigation).map(({ id }) => id),
    ).toEqual([
      "link:url",
      "link:action",
      "link:disabled-child",
      "link:service-child",
      "link:favorites-child",
      "link:custom",
    ]);
  });

  it("закрепляет целый раздел только по opt-in при наличии доступного назначения", () => {
    const section = (
      id: string,
      extra: Partial<SystemAdminNavigationItem> = {},
    ): SystemAdminNavigationItem => ({
      id,
      label: id,
      icon: null,
      favoriteable: true,
      ...extra,
    });
    const sections = [
      section("default", { href: "/admin", favoriteable: undefined }),
      section("denied", { href: "/admin", favoriteable: false }),
      section("empty"),
      section("url", { href: "/admin/work" }),
      section("action", { onSelect: vi.fn() }),
      section("panel", { panel: h("p", null, "Рабочий экран") }),
      section("disabled-group", {
        groups: [
          {
            id: "blocked",
            label: "Недоступно",
            items: [
              {
                id: "blocked",
                label: "Недоступно",
                icon: null,
                href: "/admin",
                disabled: true,
              },
            ],
          },
        ],
      }),
      section("group", {
        groups: [
          {
            id: "work",
            label: "Работа",
            items: [
              {
                id: "group-link",
                label: "Рабочий пункт",
                icon: null,
                onSelect: vi.fn(),
              },
            ],
          },
        ],
      }),
    ];
    expect(
      getSystemAdminFavoriteTargets(sections)
        .filter(({ sectionId }) => sectionId)
        .map(({ id }) => id),
    ).toEqual([
      "section:url",
      "section:action",
      "section:panel",
      "section:group",
    ]);
  });
});
