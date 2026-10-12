/**
 * @file tests/int/system-admin-navigation.int.spec.ts
 * @version 1.9.2
 * @date 2026-10-12
 * @description Проверяет группы подпунктов, hover, клавиатурную и мобильную навигацию системного меню.
 * @see documentation/architecture/system-admin-shell.md
 */

import { createElement as h, Fragment } from "react";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemAdminNavigation } from "../../packages/template-realize/src/layouts/admin/SystemAdminNavigation.component";
import type { SystemAdminNavigationItem } from "../../packages/template-realize/src/layouts/admin/SystemAdminShell.types";
import type { SystemAdminNavigationPreferences } from "../../packages/template-realize/src/layouts/admin/systemAdminNavigationPreferences.types";

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

function navigationFixture(
  mobile = false,
  hiddenWorkshop = false,
  activeNavigationId = "tasks",
  observePreferences = false,
) {
  const openHome = vi.fn();
  const openTasks = vi.fn();
  const onNavigate = vi.fn();
  const onNavigationPreferencesChange = vi.fn();
  const navigation: SystemAdminNavigationItem[] = [
    {
      id: "home",
      label: "Главная",
      icon: h("span", null, "H"),
      description: "Обзор рабочей среды",
      onSelect: openHome,
    },
    {
      id: "tasks",
      label: "Задачи",
      icon: h("span", null, "T"),
      description: "Работа команды и агентов",
      onSelect: openTasks,
    },
    {
      id: "workshop",
      label: "Мастерская",
      icon: h("span", null, "W"),
      description: "Будущее пространство разработки",
      hiddenByDefault: hiddenWorkshop,
    },
    {
      id: "settings",
      label: "Настройки системы",
      icon: h("span", null, "S"),
      href: "/admin/globals/settings",
    },
  ];
  const rendered = render(
    h(
      Fragment,
      null,
      h("button", null, "Рабочая область"),
      h(SystemAdminNavigation, {
        navigation,
        activeNavigationId,
        onNavigate,
        onNavigationPreferencesChange: observePreferences
          ? onNavigationPreferencesChange
          : undefined,
        mobile,
        theme: "light",
      }),
    ),
  );
  return {
    ...rendered,
    openHome,
    openTasks,
    onNavigate,
    onNavigationPreferencesChange,
  };
}

function groupedNavigationFixture(mobile = false) {
  const openParent = vi.fn();
  const openQueue = vi.fn();
  const openUnavailable = vi.fn();
  const onNavigate = vi.fn();
  const navigation: SystemAdminNavigationItem[] = [
    {
      id: "ai",
      label: "AI",
      icon: null,
      href: "/admin/ai",
      onSelect: openParent,
      groups: [
        {
          id: "workspace",
          label: "Рабочая среда",
          items: [
            {
              id: "assistant",
              label: "AI-ассистент",
              icon: null,
              href: "/admin/ai",
            },
            {
              id: "unavailable",
              label: "Недоступный раздел",
              icon: null,
              href: "/admin/restricted",
              onSelect: openUnavailable,
              disabled: true,
              statusLabel: "Планируется",
            },
          ],
        },
        {
          id: "execution",
          label: "Выполнение",
          items: [
            {
              id: "queue",
              label: "Локальная очередь",
              icon: null,
              onSelect: openQueue,
            },
            {
              id: "without-action",
              label: "Раздел без действия",
              icon: null,
            },
          ],
        },
      ],
    },
  ];
  render(
    h(SystemAdminNavigation, {
      navigation,
      activeNavigationId: "ai",
      onNavigate,
      mobile,
      theme: "light",
    }),
  );
  return { openParent, openQueue, openUnavailable, onNavigate };
}

function homeNavigationFixture(mobile = false) {
  const openFavorites = vi.fn();
  const openProject = vi.fn();
  const openUnavailable = vi.fn();
  const customizeDesktop = vi.fn();
  const onNavigate = vi.fn();
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
              disabled: true,
              href: "/admin/favorites",
              onSelect: openFavorites,
              shortcuts: [
                {
                  id: "project",
                  label: "Проект магазина",
                  icon: null,
                  onSelect: openProject,
                },
                {
                  id: "unavailable",
                  label: "Недоступный проект",
                  icon: null,
                  href: "/admin/projects/restricted",
                  onSelect: openUnavailable,
                  disabled: true,
                },
                {
                  id: "all",
                  label: "Показать все",
                  icon: null,
                },
              ],
            },
          ],
        },
      ],
      footerAction: {
        label: "Настроить рабочий стол",
        icon: null,
        href: "/admin/desktop/settings",
        onSelect: customizeDesktop,
      },
    },
  ];
  const props = {
    navigation,
    activeNavigationId: "home",
    onNavigate,
    mobile,
    theme: "light" as const,
  };
  const rendered = render(h(SystemAdminNavigation, props));
  return {
    ...rendered,
    props,
    openFavorites,
    openProject,
    openUnavailable,
    customizeDesktop,
    onNavigate,
  };
}

/** Host использует полученный lifecycle callback только после выбора контейнера. */
function customPanelFixture(mobile = false) {
  const onNavigate = vi.fn();
  const onSelect = vi.fn();
  const createFolder = vi.fn();
  const navigation: SystemAdminNavigationItem[] = [
    {
      id: "tasks",
      label: "Задачи",
      icon: null,
      onSelect,
      panel: (closeAfterNavigation) =>
        h(
          Fragment,
          null,
          h("button", { onClick: closeAfterNavigation }, "Выбрать список"),
          h("button", { onClick: createFolder }, "Создать папку"),
        ),
    },
  ];
  render(
    h(SystemAdminNavigation, {
      navigation,
      activeNavigationId: "tasks",
      mobile,
      theme: "light",
      onNavigate,
    }),
  );
  return { onNavigate, onSelect, createFolder };
}

/** Реальная мышь создаёт pointer и mouse события; тест не зависит от выбранного React handler. */
function enter(element: Element) {
  fireEvent.pointerEnter(element, { pointerType: "mouse" });
  fireEvent.mouseEnter(element);
}

function leave(element: Element) {
  fireEvent.pointerLeave(element, {
    pointerType: "mouse",
    relatedTarget: document.body,
  });
  fireEvent.mouseLeave(element, { relatedTarget: document.body });
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function openCustomization(mobile = false) {
  fireEvent.click(screen.getByRole("button", { name: "Ещё" }));
  advance(20);
  fireEvent.click(screen.getByRole("button", { name: "Настроить навигацию" }));
  advance(20);
  return screen.getByRole(mobile ? "region" : "dialog", {
    name: "Настройка навигации",
  });
}

function customizationOrder() {
  return within(screen.getByRole("list", { name: "Порядок разделов" }))
    .getAllByRole("switch")
    .map((control) => control.getAttribute("aria-label"));
}

function dragDataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "none",
    dropEffect: "none",
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
    }),
    getData: vi.fn((type: string) => data.get(type) ?? ""),
    setDragImage: vi.fn(),
    get types() {
      return [...data.keys()];
    },
  };
}

/** JSDOM не рассчитывает layout; задаём входные координаты, результат проверяем по порядку и текстовой подсказке. */
function dragGeometry() {
  const list = screen.getByRole("list", { name: "Порядок разделов" });
  const rows = within(list).getAllByRole("listitem");
  vi.spyOn(list, "getBoundingClientRect").mockReturnValue(
    new DOMRect(100, 100, 280, rows.length * 60 - 10),
  );
  rows.forEach((row) => {
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(
      () =>
        new DOMRect(
          100,
          100 + Array.from(list.children).indexOf(row) * 60,
          280,
          50,
        ),
    );
  });
  return { list, rows };
}

function drag(
  name: "dragStart" | "dragOver" | "drop" | "dragEnd",
  element: Element,
  dataTransfer: ReturnType<typeof dragDataTransfer>,
  clientY: number,
  clientX = 120,
) {
  const event = createEvent[name](element, { dataTransfer });
  // JSDOM без DragEvent игнорирует координаты конструктора Event, поэтому задаём их явно.
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  fireEvent(element, event);
}

beforeEach(() => {
  vi.useFakeTimers();
  // JSDOM не прокручивает layout; этот метод нужен только для мобильного focus lifecycle.
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
  if (scrollIntoViewDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      scrollIntoViewDescriptor,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

describe("Общая навигация системной админки", () => {
  it("сохраняет доступное описание раздела и закрывает панель по Escape с возвратом focus", () => {
    const { openHome, onNavigate } = navigationFixture();
    const home = screen.getByRole("button", { name: "Главная" });
    fireEvent.click(home);
    advance(20);
    const panel = screen.getByRole("dialog", {
      name: "Главная",
      description: "Обзор рабочей среды",
    });
    const heading = within(panel).getByRole("heading", { name: "Главная" });
    act(() => heading.focus());
    fireEvent.keyDown(heading, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(home);
    expect(openHome).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("custom panel закрывает hover после выбора, сохраняя создание открытым и не дублируя переход родителя", () => {
    const { onNavigate, onSelect, createFolder } = customPanelFixture();
    enter(screen.getByRole("button", { name: "Задачи" }));
    advance(120);
    const panel = screen.getByRole("dialog", { name: "Задачи" });
    expect(
      within(panel).queryByRole("button", { name: /Открыть раздел/ }),
    ).toBeNull();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Создать папку" }),
    );
    expect(createFolder).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBe(panel);
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Выбрать список" }),
    );
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("custom panel сохраняет тот же закреплённый dialog после callback навигации", () => {
    const { onNavigate } = customPanelFixture();
    fireEvent.click(screen.getByRole("button", { name: "Раскрыть меню" }));
    advance(20);
    const panel = screen.getByRole("dialog", { name: "Задачи" });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Выбрать список" }),
    );
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBe(panel);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("custom panel закрывает мобильный region без вложенного dialog после выбора", () => {
    const { onNavigate } = customPanelFixture(true);
    fireEvent.click(screen.getByRole("button", { name: "Задачи" }));
    advance(20);
    const panel = screen.getByRole("region", { name: "Задачи" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Выбрать список" }),
    );
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Задачи" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("открывает быстрый проект недоступного родителя, независимо проверяя доступность остальных быстрых ссылок", () => {
    const { openFavorites, openProject, openUnavailable, onNavigate } =
      homeNavigationFixture();
    enter(screen.getByRole("button", { name: "Главная" }));
    advance(120);
    const panel = screen.getByRole("dialog", { name: "Главная" });
    ["Избранное", "Недоступный проект", "Показать все"].forEach((name) => {
      const button = within(panel).getByRole("button", { name });
      expect(button.hasAttribute("disabled")).toBe(true);
      fireEvent.click(button);
    });
    expect(openFavorites).not.toHaveBeenCalled();
    expect(openUnavailable).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    const project = within(panel).getByRole("button", {
      name: "Проект магазина",
    });
    expect(project.hasAttribute("disabled")).toBe(false);
    fireEvent.click(project);
    expect(openProject).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(openFavorites).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("сохраняет закреплённую панель после быстрой ссылки и нижнего действия", () => {
    const { openProject, customizeDesktop, onNavigate } =
      homeNavigationFixture();
    fireEvent.click(screen.getByRole("button", { name: "Раскрыть меню" }));
    advance(20);
    const panel = screen.getByRole("dialog", { name: "Главная" });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Проект магазина" }),
    );
    expect(openProject).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Главная" })).toBe(panel);
    const footer = within(panel).getByRole("link", {
      name: "Настроить рабочий стол",
    });
    expect(footer.getAttribute("href")).toBe("/admin/desktop/settings");
    // JSDOM не выполняет переход страницы; React callback проверяется обычным click.
    footer.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(footer);
    expect(customizeDesktop).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog", { name: "Главная" })).toBe(panel);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("закрывает мобильную встроенную панель при выборе быстрого проекта без вложенного dialog", () => {
    const { openProject, onNavigate } = homeNavigationFixture(true);
    fireEvent.click(screen.getByRole("button", { name: "Главная" }));
    advance(20);
    const panel = screen.getByRole("region", { name: "Главная" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Проект магазина" }),
    );
    expect(openProject).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Главная" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("блокирует нижнее действие по disabled или отсутствию команды и выполняет доступный callback", () => {
    const { props, rerender, customizeDesktop, onNavigate } =
      homeNavigationFixture();
    const action = props.navigation[0].footerAction!;
    const setFooter = (
      footerAction: SystemAdminNavigationItem["footerAction"],
    ) =>
      rerender(
        h(SystemAdminNavigation, {
          ...props,
          navigation: [{ ...props.navigation[0], footerAction }],
        }),
      );
    enter(screen.getByRole("button", { name: "Главная" }));
    advance(120);
    const panel = screen.getByRole("dialog", { name: "Главная" });
    setFooter({ ...action, disabled: true });
    expect(
      within(panel).queryByRole("link", { name: action.label }),
    ).toBeNull();
    const blocked = within(panel).getByRole("button", { name: action.label });
    expect(blocked.hasAttribute("disabled")).toBe(true);
    fireEvent.click(blocked);
    expect(customizeDesktop).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();

    setFooter({ label: action.label, icon: null });
    const withoutAction = within(panel).getByRole("button", {
      name: action.label,
    });
    expect(withoutAction.hasAttribute("disabled")).toBe(true);
    fireEvent.click(withoutAction);
    expect(onNavigate).not.toHaveBeenCalled();

    setFooter({ label: action.label, icon: null, onSelect: customizeDesktop });
    fireEvent.click(within(panel).getByRole("button", { name: action.label }));
    expect(customizeDesktop).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("показывает группы и нативные ссылки без пустого состояния и дублирующего действия раздела", () => {
    const { openParent, onNavigate } = groupedNavigationFixture();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    advance(20);
    const panel = screen.getByRole("dialog", { name: "AI" });
    expect(
      within(panel).getByRole("region", { name: "Рабочая среда" }),
    ).toBeTruthy();
    expect(
      within(panel).getByRole("heading", { name: "Выполнение" }),
    ).toBeTruthy();
    expect(
      within(panel)
        .getByRole("link", { name: "AI-ассистент" })
        .getAttribute("href"),
    ).toBe("/admin/ai");
    expect(
      within(panel).queryByText("Подразделы пока не добавлены."),
    ).toBeNull();
    expect(within(panel).queryByText("Открыть раздел")).toBeNull();
    expect(openParent).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("выполняет выбранный подпункт и закрывает hover-панель через общий onNavigate", () => {
    const { openParent, openQueue, onNavigate } = groupedNavigationFixture();
    enter(screen.getByRole("button", { name: "AI" }));
    advance(120);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "AI" })).getByRole("button", {
        name: "Локальная очередь",
      }),
    );
    expect(openQueue).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(openParent).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("блокирует disabled подпункт даже с href и callback и не выдумывает действие для пустого контракта", () => {
    const { openUnavailable, onNavigate } = groupedNavigationFixture();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    advance(20);
    const panel = screen.getByRole("dialog", { name: "AI" });
    const unavailable = within(panel).getByRole("button", {
      name: /^Недоступный раздел/,
    });
    const withoutAction = within(panel).getByRole("button", {
      name: "Раздел без действия",
    });
    expect(unavailable.hasAttribute("disabled")).toBe(true);
    expect(withoutAction.hasAttribute("disabled")).toBe(true);
    expect(unavailable.hasAttribute("href")).toBe(false);
    expect(
      within(panel).queryByRole("link", { name: /^Недоступный раздел/ }),
    ).toBeNull();
    fireEvent.click(unavailable);
    fireEvent.click(withoutAction);
    expect(openUnavailable).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "AI" })).toBe(panel);
  });

  it("сохраняет тот же закреплённый dialog после локального действия подпункта", () => {
    const { openQueue, onNavigate } = groupedNavigationFixture();
    fireEvent.click(screen.getByRole("button", { name: "Раскрыть меню" }));
    advance(20);
    const panel = screen.getByRole("dialog", { name: "AI" });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Локальная очередь" }),
    );
    expect(openQueue).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "AI" })).toBe(panel);
    expect(
      screen
        .getByRole("button", { name: "Свернуть меню" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("на мобильном выбирает подпункт во встроенной панели без вложенного dialog", () => {
    const { openQueue, onNavigate } = groupedNavigationFixture(true);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    advance(20);
    const panel = screen.getByRole("region", { name: "AI" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Локальная очередь" }),
    );
    expect(openQueue).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("открывает hover после задержки, сохраняя текущий раздел и focus рабочей области", () => {
    const { openHome, openTasks, onNavigate } = navigationFixture();
    const workspace = screen.getByRole("button", { name: "Рабочая область" });
    const home = screen.getByRole("button", { name: "Главная" });
    const tasks = screen.getByRole("button", { name: "Задачи" });
    workspace.focus();
    expect(tasks.getAttribute("aria-current")).toBe("page");
    expect(home.getAttribute("aria-expanded")).toBe("false");
    enter(home);
    advance(119);
    expect(screen.queryByRole("dialog")).toBeNull();
    advance(1);
    expect(
      within(screen.getByRole("dialog", { name: "Главная" })).getByRole(
        "heading",
        { name: "Главная" },
      ),
    ).toBeTruthy();
    expect(home.getAttribute("aria-expanded")).toBe("true");
    expect(tasks.getAttribute("aria-current")).toBe("page");
    expect(home.hasAttribute("aria-current")).toBe(false);
    expect(document.activeElement).toBe(workspace);
    expect(openHome).not.toHaveBeenCalled();
    expect(openTasks).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("не открывает панель при коротком проходе курсора через раздел", () => {
    navigationFixture();
    const home = screen.getByRole("button", { name: "Главная" });
    enter(home);
    advance(50);
    leave(home);
    advance(500);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(home.getAttribute("aria-expanded")).toBe("false");
  });

  it("сохраняет flyout при переходе через зазор и закрывает после ухода с панели", () => {
    navigationFixture();
    const tasks = screen.getByRole("button", { name: "Задачи" });
    enter(tasks);
    advance(120);
    const panel = screen.getByRole("dialog", { name: "Задачи" });
    leave(tasks);
    advance(150);
    enter(panel);
    advance(400);
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBe(panel);
    leave(panel);
    advance(239);
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBe(panel);
    advance(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(tasks.getAttribute("aria-expanded")).toBe("false");
  });

  it("сменяет просмотр раздела без старого таймера закрытия или перехода", () => {
    const { openHome, openTasks, onNavigate } = navigationFixture();
    const home = screen.getByRole("button", { name: "Главная" });
    const tasks = screen.getByRole("button", { name: "Задачи" });
    enter(home);
    advance(120);
    leave(home);
    enter(tasks);
    advance(120);
    advance(300);
    expect(screen.queryByRole("dialog", { name: "Главная" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBeTruthy();
    expect(home.getAttribute("aria-expanded")).toBe("false");
    expect(tasks.getAttribute("aria-expanded")).toBe("true");
    expect(openHome).not.toHaveBeenCalled();
    expect(openTasks).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("перемещает focus стрелками и Home/End, открывает ArrowRight и возвращает Escape", () => {
    const { openHome, openTasks, onNavigate } = navigationFixture();
    const home = screen.getByRole("button", { name: "Главная" });
    const tasks = screen.getByRole("button", { name: "Задачи" });
    const more = screen.getByRole("button", { name: "Ещё" });
    act(() => {
      home.focus();
    });
    fireEvent.keyDown(home, { key: "ArrowDown" });
    expect(document.activeElement).toBe(tasks);
    fireEvent.keyDown(tasks, { key: "End" });
    expect(document.activeElement).toBe(more);
    fireEvent.keyDown(more, { key: "Home" });
    expect(document.activeElement).toBe(home);
    fireEvent.keyDown(home, { key: "ArrowUp" });
    expect(document.activeElement).toBe(more);
    fireEvent.keyDown(more, { key: "ArrowRight" });
    advance(20);
    const heading = within(
      screen.getByRole("dialog", { name: "Ещё" }),
    ).getByRole("heading", { name: "Ещё" });
    expect(document.activeElement).toBe(heading);
    fireEvent.keyDown(heading, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(openHome).not.toHaveBeenCalled();
    expect(openTasks).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("выполняет команду только через явное действие Открыть раздел", () => {
    const { openTasks, onNavigate } = navigationFixture();
    const tasks = screen.getByRole("button", { name: "Задачи" });
    fireEvent.click(tasks);
    advance(20);
    const panel = screen.getByRole("dialog", { name: "Задачи" });
    expect(document.activeElement).toBe(
      within(panel).getByRole("heading", { name: "Задачи" }),
    );
    expect(openTasks).not.toHaveBeenCalled();
    const openSection = within(panel).getByRole("button", {
      name: "Открыть раздел",
    });
    act(() => {
      openSection.focus();
    });
    fireEvent.click(openSection);
    expect(openTasks).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(tasks);
  });

  it("сохраняет нативную ссылку известного раздела и не выдумывает действие для будущего", () => {
    navigationFixture();
    enter(screen.getByRole("button", { name: "Настройки системы" }));
    advance(120);
    expect(
      within(screen.getByRole("dialog", { name: "Настройки системы" }))
        .getByRole("link", { name: "Открыть раздел" })
        .getAttribute("href"),
    ).toBe("/admin/globals/settings");
    enter(screen.getByRole("button", { name: "Мастерская" }));
    advance(120);
    const workshop = screen.getByRole("dialog", { name: "Мастерская" });
    expect(
      within(workshop).getByRole("heading", { name: "Мастерская" }),
    ).toBeTruthy();
    expect(
      within(workshop).queryByRole("button", { name: "Открыть раздел" }),
    ).toBeNull();
    expect(within(workshop).queryByRole("link")).toBeNull();
  });

  it("закрывается по нажатию вне навигации без смены раздела", () => {
    const { openHome, onNavigate } = navigationFixture();
    enter(screen.getByRole("button", { name: "Главная" }));
    advance(120);
    expect(screen.getByRole("dialog", { name: "Главная" })).toBeTruthy();
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Рабочая область" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(openHome).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("на мобильном игнорирует hover и открывает встроенную панель по нажатию", () => {
    const { openTasks, onNavigate } = navigationFixture(true);
    expect(screen.queryByRole("button", { name: "Раскрыть меню" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Свернуть меню" })).toBeNull();
    const tasks = screen.getByRole("button", { name: "Задачи" });
    enter(tasks);
    advance(500);
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(tasks);
    advance(20);
    const panel = screen.getByRole("region", { name: "Задачи" });
    expect(
      screen
        .getByRole("navigation", { name: "Разделы системы" })
        .contains(panel),
    ).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(tasks.getAttribute("aria-expanded")).toBe("true");
    expect(openTasks).not.toHaveBeenCalled();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Открыть раздел" }),
    );
    expect(openTasks).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("на мобильном показывает один экран и возвращает фокус выбранному разделу кнопкой назад и Escape", () => {
    const { onNavigate } = navigationFixture(true);
    const tasks = screen.getByRole("button", { name: "Задачи" });
    fireEvent.click(tasks);
    advance(20);
    let panel = screen.getByRole("region", { name: "Задачи" });
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Рабочая область" }),
    );
    expect(screen.getByRole("region", { name: "Задачи" })).toBe(panel);
    expect(screen.queryByRole("button", { name: "Главная" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Закрыть меню раздела" }),
    ).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "К разделам" }));
    expect(screen.queryByRole("region", { name: "Задачи" })).toBeNull();
    expect(document.activeElement).toBe(tasks);
    expect(screen.getByRole("button", { name: "Главная" })).toBeTruthy();
    fireEvent.click(tasks);
    advance(20);
    panel = screen.getByRole("region", { name: "Задачи" });
    fireEvent.keyDown(within(panel).getByRole("heading", { name: "Задачи" }), {
      key: "Escape",
    });
    expect(document.activeElement).toBe(tasks);
    expect(screen.queryByRole("region", { name: "Задачи" })).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("раскрывает постоянную панель активного раздела без перехода и изменения preferences", () => {
    const { openHome, openTasks, onNavigate, onNavigationPreferencesChange } =
      navigationFixture(false, false, "tasks", true);
    const toggle = screen.getByRole("button", { name: "Раскрыть меню" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(toggle);
    advance(20);
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Свернуть меню" })).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(openHome).not.toHaveBeenCalled();
    expect(openTasks).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onNavigationPreferencesChange).not.toHaveBeenCalled();
  });

  it("сохраняет уже открытую панель после закрепления, ухода, outside и прокрутки мимо trigger", () => {
    const { onNavigationPreferencesChange, openHome, onNavigate } =
      navigationFixture(false, false, "tasks", true);
    const home = screen.getByRole("button", { name: "Главная" });
    enter(home);
    advance(120);
    const panel = screen.getByRole("dialog", { name: "Главная" });
    fireEvent.click(screen.getByRole("button", { name: "Раскрыть меню" }));
    advance(20);
    expect(screen.getByRole("dialog", { name: "Главная" })).toBe(panel);
    const workspace = screen.getByRole("button", { name: "Рабочая область" });
    act(() => workspace.focus());
    leave(home);
    leave(panel);
    advance(500);
    fireEvent.pointerDown(workspace);
    expect(screen.getByRole("dialog", { name: "Главная" })).toBe(panel);
    const modules = home.parentElement!;
    vi.spyOn(home, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 50, 40),
    );
    vi.spyOn(modules, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 100, 68, 200),
    );
    fireEvent.scroll(modules);
    advance(300);
    expect(screen.getByRole("dialog", { name: "Главная" })).toBe(panel);
    expect(onNavigationPreferencesChange).not.toHaveBeenCalled();
    expect(openHome).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("меняет содержимое закреплённого dialog по hover, клавиатуре и настройкам без замены DOM", () => {
    const { openHome, openTasks, onNavigate, onNavigationPreferencesChange } =
      navigationFixture(false, false, "tasks", true);
    const navigation = screen.getByRole("navigation", {
      name: "Разделы системы",
    });
    const more = screen.getByRole("button", { name: "Ещё" });
    vi.spyOn(navigation, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 52, 62, 600),
    );
    vi.spyOn(more, "getBoundingClientRect").mockReturnValue(
      new DOMRect(11, 550, 45, 44),
    );
    enter(more);
    advance(140);
    const panel = screen.getByRole("dialog", { name: "Ещё" });
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(
      new DOMRect(68, 379, 320, 273),
    );
    fireEvent(window, new Event("resize"));
    advance(20);
    const hoverGeometry = {
      top: panel.style.top,
      height: panel.style.height,
      maxHeight: panel.style.maxHeight,
    };
    fireEvent.click(screen.getByRole("button", { name: "Раскрыть меню" }));
    advance(20);
    expect(screen.getByRole("dialog", { name: "Ещё" })).toBe(panel);
    expect(panel.dataset.compact).toBe("true");
    expect({
      top: panel.style.top,
      height: panel.style.height,
      maxHeight: panel.style.maxHeight,
    }).toEqual(hoverGeometry);
    const home = screen.getByRole("button", { name: "Главная" });
    enter(home);
    advance(120);
    expect(screen.getByRole("dialog", { name: "Главная" })).toBe(panel);
    expect(panel.dataset.compact).toBe("false");
    expect(panel.style.top).toBe("52px");
    expect(panel.style.height).toBe("600px");
    act(() => home.focus());
    fireEvent.keyDown(home, { key: "ArrowDown" });
    advance(20);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Задачи" }),
    );
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBe(panel);
    fireEvent.click(screen.getByRole("button", { name: "Ещё" }));
    advance(20);
    expect(screen.getByRole("dialog", { name: "Ещё" })).toBe(panel);
    expect(panel.dataset.compact).toBe("true");
    expect(panel.style.height).toBe("");
    fireEvent.click(
      within(panel).getByRole("button", { name: "Настроить навигацию" }),
    );
    advance(20);
    expect(screen.getByRole("dialog", { name: "Настройка навигации" })).toBe(
      panel,
    );
    expect(panel.dataset.compact).toBe("false");
    expect(panel.style.height).toBe("600px");
    fireEvent.click(within(panel).getByRole("button", { name: "Готово" }));
    advance(20);
    expect(screen.getByRole("dialog", { name: "Ещё" })).toBe(panel);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen
        .getByRole("button", { name: "Свернуть меню" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(openHome).not.toHaveBeenCalled();
    expect(openTasks).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onNavigationPreferencesChange).not.toHaveBeenCalled();
  });

  it("оставляет закреплённую панель при явном локальном переходе", () => {
    const { openTasks, onNavigate, onNavigationPreferencesChange } =
      navigationFixture(false, false, "tasks", true);
    fireEvent.click(screen.getByRole("button", { name: "Раскрыть меню" }));
    advance(20);
    const panel = screen.getByRole("dialog", { name: "Задачи" });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Открыть раздел" }),
    );
    advance(20);
    expect(openTasks).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBe(panel);
    expect(
      screen
        .getByRole("button", { name: "Свернуть меню" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(onNavigationPreferencesChange).not.toHaveBeenCalled();
  });

  it.each(["toggle", "Escape", "close"] as const)(
    "сворачивает постоянную панель через %s и возвращает обычное hover-поведение",
    (reason) => {
      const { onNavigationPreferencesChange, openTasks, onNavigate } =
        navigationFixture(false, false, "tasks", true);
      const toggle = screen.getByRole("button", { name: "Раскрыть меню" });
      fireEvent.click(toggle);
      advance(20);
      const panel = screen.getByRole("dialog", { name: "Задачи" });
      if (reason === "toggle") fireEvent.click(toggle);
      else if (reason === "Escape")
        fireEvent.keyDown(
          within(panel).getByRole("heading", { name: "Задачи" }),
          { key: "Escape" },
        );
      else
        fireEvent.click(
          within(panel).getByRole("button", { name: "Закрыть меню раздела" }),
        );
      advance(20);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("button", { name: "Раскрыть меню" })).toBe(
        toggle,
      );
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(
        reason === "toggle"
          ? toggle
          : screen.getByRole("button", { name: "Задачи" }),
      );
      act(() =>
        screen.getByRole("button", { name: "Рабочая область" }).focus(),
      );
      enter(screen.getByRole("button", { name: "Главная" }));
      advance(120);
      const hoverPanel = screen.getByRole("dialog", { name: "Главная" });
      leave(hoverPanel);
      advance(240);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(onNavigationPreferencesChange).not.toHaveBeenCalled();
      expect(openTasks).not.toHaveBeenCalled();
      expect(onNavigate).not.toHaveBeenCalled();
    },
  );

  it("переключает закреплённую панель на доступный раздел при удалении host-пункта без замены DOM", () => {
    const openHome = vi.fn();
    const openTasks = vi.fn();
    const navigation: SystemAdminNavigationItem[] = [
      { id: "home", label: "Главная", icon: null, onSelect: openHome },
      { id: "tasks", label: "Задачи", icon: null, onSelect: openTasks },
    ];
    const props = {
      navigation,
      activeNavigationId: "tasks",
      theme: "light" as const,
      onNavigationPreferencesChange: vi.fn(),
      onNavigate: vi.fn(),
    };
    const { rerender } = render(h(SystemAdminNavigation, props));
    fireEvent.click(screen.getByRole("button", { name: "Главная" }));
    advance(20);
    const panel = screen.getByRole("dialog", { name: "Главная" });
    fireEvent.click(screen.getByRole("button", { name: "Раскрыть меню" }));
    advance(20);
    rerender(
      h(SystemAdminNavigation, { ...props, navigation: navigation.slice(1) }),
    );
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBe(panel);
    advance(20);
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBe(panel);
    expect(
      screen
        .getByRole("button", { name: "Задачи" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    rerender(h(SystemAdminNavigation, props));
    advance(20);
    expect(screen.getByRole("dialog", { name: "Задачи" })).toBe(panel);
    expect(openHome).not.toHaveBeenCalled();
    expect(openTasks).not.toHaveBeenCalled();
    expect(props.onNavigationPreferencesChange).not.toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it("закрепляет скрытый активный раздел из Ещё и возвращает focus его новой кнопке", () => {
    const { openHome, openTasks, onNavigate } = navigationFixture(
      false,
      true,
      "workshop",
    );
    const navigation = screen.getByRole("navigation", {
      name: "Разделы системы",
    });
    const more = within(navigation).getByRole("button", { name: "Ещё" });
    expect(
      within(navigation).queryByRole("button", { name: "Мастерская" }),
    ).toBeNull();
    expect(more.getAttribute("aria-current")).toBe("page");
    fireEvent.click(more);
    advance(20);
    const tile = within(screen.getByRole("dialog", { name: "Ещё" })).getByRole(
      "button",
      { name: "Мастерская" },
    );
    expect(tile.getAttribute("aria-current")).toBe("page");
    fireEvent.click(tile);
    advance(20);
    const heading = within(
      screen.getByRole("dialog", { name: "Мастерская" }),
    ).getByRole("heading", { name: "Мастерская" });
    expect(document.activeElement).toBe(heading);
    const pinned = within(navigation).getByRole("button", {
      name: "Мастерская",
    });
    expect(pinned.getAttribute("aria-expanded")).toBe("true");
    expect(pinned.getAttribute("aria-current")).toBe("page");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(more.hasAttribute("aria-current")).toBe(false);
    expect(openHome).not.toHaveBeenCalled();
    expect(openTasks).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.keyDown(heading, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(pinned);
  });

  it("сохраняет доступ к настройкам в Ещё, когда все разделы уже видимы", () => {
    navigationFixture();
    fireEvent.click(screen.getByRole("button", { name: "Ещё" }));
    advance(20);
    const panel = screen.getByRole("dialog", { name: "Ещё" });
    expect(within(panel).getByText(/Все разделы уже показаны/)).toBeTruthy();
    expect(
      within(panel).getByRole("button", { name: "Настроить навигацию" }),
    ).toBeTruthy();
    expect(
      within(panel).queryByRole("group", { name: "Скрытые разделы" }),
    ).toBeNull();
  });

  it("сразу применяет видимость и клавиатурный порядок, включая скрытые разделы, и сбрасывает настройки", () => {
    navigationFixture(false, true);
    const panel = openCustomization();
    const navigation = screen.getByRole("navigation", {
      name: "Разделы системы",
    });
    fireEvent.click(
      within(panel).getByRole("switch", { name: "Показывать Главная" }),
    );
    expect(
      within(navigation).queryByRole("button", { name: "Главная" }),
    ).toBeNull();
    const up = within(panel).getByRole("button", { name: "Выше: Мастерская" });
    act(() => {
      up.focus();
    });
    fireEvent.click(up);
    expect(document.activeElement).toBe(up);
    expect(customizationOrder()).toEqual([
      "Показывать Главная",
      "Показывать Мастерская",
      "Показывать Задачи",
      "Показывать Настройки системы",
    ]);
    const down = within(panel).getByRole("button", {
      name: "Ниже: Мастерская",
    });
    act(() => {
      down.focus();
    });
    fireEvent.click(down);
    expect(document.activeElement).toBe(down);
    fireEvent.click(up);
    expect(
      (
        within(panel).getByRole("switch", {
          name: "Показывать Мастерская",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    fireEvent.click(within(panel).getByRole("button", { name: "Готово" }));
    advance(20);
    const more = screen.getByRole("dialog", { name: "Ещё" });
    expect(within(more).getByRole("button", { name: "Главная" })).toBeTruthy();
    expect(
      within(more).getByRole("button", { name: "Мастерская" }),
    ).toBeTruthy();
    fireEvent.click(
      within(more).getByRole("button", { name: "Настроить навигацию" }),
    );
    advance(20);
    fireEvent.click(
      screen.getByRole("button", { name: "Сбросить по умолчанию" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Настройка навигации" }),
    ).toBeTruthy();
    expect(customizationOrder()).toEqual([
      "Показывать Главная",
      "Показывать Задачи",
      "Показывать Мастерская",
      "Показывать Настройки системы",
    ]);
    expect(
      within(navigation).getByRole("button", { name: "Главная" }),
    ).toBeTruthy();
    expect(
      within(navigation).queryByRole("button", { name: "Мастерская" }),
    ).toBeNull();
  });

  it("переставляет раздел drop-операцией, не теряя скрытый пункт", () => {
    navigationFixture(false, true);
    const panel = openCustomization();
    const handle = within(panel).getByRole("button", {
      name: "Перетащить Настройки системы",
    });
    const targetRow = within(panel)
      .getByRole("switch", { name: "Показывать Главная" })
      .closest("li");
    expect(targetRow).not.toBeNull();
    if (!targetRow) throw new Error("Строка целевого раздела не найдена");
    dragGeometry();
    const dataTransfer = dragDataTransfer();
    drag("dragStart", handle, dataTransfer, 300);
    expect(dataTransfer.setDragImage).toHaveBeenCalledTimes(1);
    const image = dataTransfer.setDragImage.mock.calls[0][0] as HTMLElement;
    expect(image.tagName).toBe("LI");
    expect(image.textContent).toContain("Настройки системы");
    expect(image.querySelector('input[role="switch"]')).not.toBeNull();
    expect(image.getAttribute("aria-hidden")).toBe("true");
    drag("dragOver", targetRow, dataTransfer, 110);
    expect(customizationOrder()[0]).toBe("Показывать Главная");
    expect(screen.getByRole("status").textContent).toMatch(
      /Настройки системы.*перед.*Главная/,
    );
    drag("drop", targetRow, dataTransfer, 110);
    drag("dragEnd", handle, dataTransfer, 110);
    expect(customizationOrder()).toEqual([
      "Показывать Настройки системы",
      "Показывать Главная",
      "Показывать Задачи",
      "Показывать Мастерская",
    ]);
    expect(
      (
        within(panel).getByRole("switch", {
          name: "Показывать Мастерская",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(
      (
        within(panel).getByRole("button", {
          name: "Выше: Настройки системы",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        within(panel).getByRole("button", {
          name: "Ниже: Мастерская",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("позволяет показать скрытый раздел и завершить настройку в мобильной inline-панели", () => {
    navigationFixture(true, true);
    const panel = openCustomization(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      within(panel).getByRole("switch", { name: "Показывать Мастерская" }),
    );
    const navigation = screen.getByRole("navigation", {
      name: "Разделы системы",
    });
    expect(
      within(navigation).queryByRole("button", { name: "Мастерская" }),
    ).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Готово" }));
    advance(20);
    const more = screen.getByRole("region", { name: "Ещё" });
    expect(within(more).getByText(/Все разделы уже показаны/)).toBeTruthy();
    fireEvent.click(within(more).getByRole("button", { name: "К разделам" }));
    expect(
      within(navigation).getByRole("button", { name: "Мастерская" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("переякоривает открытую панель при внешнем скрытии и восстановлении раздела", () => {
    const navigation: SystemAdminNavigationItem[] = [
      { id: "home", label: "Главная", icon: null, onSelect: vi.fn() },
      { id: "tasks", label: "Задачи", icon: null, onSelect: vi.fn() },
    ];
    const props = {
      navigation,
      activeNavigationId: "home",
      theme: "light" as const,
      navigationPreferences: {
        order: ["home", "tasks"],
        hidden: [] as string[],
      },
      onNavigationPreferencesChange: vi.fn(),
    };
    const { rerender } = render(h(SystemAdminNavigation, props));
    fireEvent.click(screen.getByRole("button", { name: "Главная" }));
    advance(20);
    rerender(
      h(SystemAdminNavigation, {
        ...props,
        navigationPreferences: {
          ...props.navigationPreferences,
          hidden: ["home"],
        },
      }),
    );
    advance(20);
    const panel = screen.getByRole("dialog", { name: "Главная" });
    const more = screen.getByRole("button", { name: "Ещё" });
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(
        screen.getByRole("navigation", { name: "Разделы системы" }),
      ).queryByRole("button", { name: "Главная" }),
    ).toBeNull();
    fireEvent.keyDown(within(panel).getByRole("heading", { name: "Главная" }), {
      key: "Escape",
    });
    expect(document.activeElement).toBe(more);
    expect(screen.queryByRole("dialog")).toBeNull();

    // Возвращаем видимость снаружи и снова открываем раздел, не выполняя pin из «Ещё».
    rerender(h(SystemAdminNavigation, props));
    advance(20);
    fireEvent.click(screen.getByRole("button", { name: "Главная" }));
    advance(20);
    rerender(
      h(SystemAdminNavigation, {
        ...props,
        navigationPreferences: {
          ...props.navigationPreferences,
          hidden: ["home"],
        },
      }),
    );
    advance(20);
    rerender(h(SystemAdminNavigation, props));
    advance(20);
    const restored = screen.getByRole("button", { name: "Главная" });
    expect(restored.getAttribute("aria-expanded")).toBe("true");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(
      within(screen.getByRole("dialog", { name: "Главная" })).getByRole(
        "heading",
        { name: "Главная" },
      ),
      { key: "Escape" },
    );
    expect(document.activeElement).toBe(restored);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(props.onNavigationPreferencesChange).not.toHaveBeenCalled();
  });

  it("закрепляет выбранный раздел одним обновлением preferences и не дублирует его при повторном открытии Ещё", () => {
    const openWorkshop = vi.fn();
    const onNavigate = vi.fn();
    const onChange = vi.fn(
      (_value: SystemAdminNavigationPreferences) => undefined,
    );
    const navigation: SystemAdminNavigationItem[] = [
      { id: "home", label: "Главная", icon: null },
      { id: "tasks", label: "Задачи", icon: null },
      {
        id: "workshop",
        label: "Мастерская",
        icon: null,
        onSelect: openWorkshop,
        hiddenByDefault: true,
      },
    ];
    const preferences: SystemAdminNavigationPreferences = {
      order: ["tasks", "workshop", "home"],
      hidden: ["workshop"],
    };
    const props = {
      navigation,
      theme: "light" as const,
      activeNavigationId: "tasks",
      navigationPreferences: preferences,
      onNavigationPreferencesChange: onChange,
      onNavigate,
    };
    const { rerender } = render(h(SystemAdminNavigation, props));
    fireEvent.click(screen.getByRole("button", { name: "Ещё" }));
    advance(20);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Ещё" })).getByRole("button", {
        name: "Мастерская",
      }),
    );
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      order: preferences.order,
      hidden: [],
    });
    rerender(
      h(SystemAdminNavigation, {
        ...props,
        navigationPreferences: onChange.mock.calls[0][0],
      }),
    );
    advance(20);
    const rail = screen.getByRole("navigation", { name: "Разделы системы" });
    expect(
      within(rail)
        .getAllByRole("button")
        .filter((button) => button.hasAttribute("data-navigation-trigger"))
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Задачи", "Мастерская", "Главная", "Ещё"]);
    const pinned = within(rail).getByRole("button", { name: "Мастерская" });
    fireEvent.keyDown(
      within(screen.getByRole("dialog", { name: "Мастерская" })).getByRole(
        "heading",
        { name: "Мастерская" },
      ),
      { key: "Escape" },
    );
    expect(document.activeElement).toBe(pinned);
    for (let count = 0; count < 2; count += 1) {
      fireEvent.click(within(rail).getByRole("button", { name: "Ещё" }));
      advance(20);
      const more = screen.getByRole("dialog", { name: "Ещё" });
      expect(
        within(more).queryByRole("button", { name: "Мастерская" }),
      ).toBeNull();
      expect(
        within(rail).getAllByRole("button", { name: "Мастерская" }),
      ).toHaveLength(1);
      fireEvent.keyDown(within(more).getByRole("heading", { name: "Ещё" }), {
        key: "Escape",
      });
    }
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(openWorkshop).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([
    ["в нижнюю половину строки", 140],
    ["в зазор между строками", 155],
  ] as const)(
    "вставляет раздел после целевой строки при drop %s",
    (_label, y) => {
      navigationFixture(false, true);
      const panel = openCustomization();
      const { list } = dragGeometry();
      const handle = within(panel).getByRole("button", {
        name: "Перетащить Настройки системы",
      });
      const dataTransfer = dragDataTransfer();
      drag("dragStart", handle, dataTransfer, 300);
      drag("dragOver", list, dataTransfer, y);
      expect(customizationOrder()).toEqual([
        "Показывать Главная",
        "Показывать Задачи",
        "Показывать Мастерская",
        "Показывать Настройки системы",
      ]);
      expect(screen.getByRole("status").textContent).toMatch(
        /после.*Главная|перед.*Задачи/,
      );
      drag("drop", list, dataTransfer, y);
      expect(customizationOrder()).toEqual([
        "Показывать Главная",
        "Показывать Настройки системы",
        "Показывать Задачи",
        "Показывать Мастерская",
      ]);
      expect(
        (
          within(panel).getByRole("switch", {
            name: "Показывать Мастерская",
          }) as HTMLInputElement
        ).checked,
      ).toBe(false);
    },
  );

  it.each(["Escape", "outside", "dragEnd"] as const)(
    "отменяет drag без изменения порядка: %s",
    (reason) => {
      navigationFixture(false, true);
      const panel = openCustomization();
      const { list } = dragGeometry();
      const handle = within(panel).getByRole("button", {
        name: "Перетащить Настройки системы",
      });
      const dataTransfer = dragDataTransfer();
      const before = customizationOrder();
      drag("dragStart", handle, dataTransfer, 300);
      drag("dragOver", list, dataTransfer, 110);
      if (reason === "Escape") fireEvent.keyDown(handle, { key: "Escape" });
      else if (reason === "outside") {
        expect(list.querySelector("[data-drop-position]")).not.toBeNull();
        expect(screen.getByRole("status").textContent).toMatch(
          /Настройки системы.*перед.*Главная/,
        );
        fireEvent.dragOver(document.body, { dataTransfer });
        expect(list.querySelector("[data-drop-position]")).toBeNull();
        expect(screen.getByRole("status").textContent).toContain(
          "Выберите место в списке",
        );
        expect(screen.getByRole("status").textContent).not.toMatch(
          /(?:перед|после).*Главная/,
        );
        drag("drop", document.body, dataTransfer, 500, 500);
      } else drag("dragEnd", handle, dataTransfer, 110);
      if (!screen.queryByRole("list", { name: "Порядок разделов" }))
        openCustomization();
      expect(customizationOrder()).toEqual(before);
      expect(document.querySelector('[data-drag-preview="true"]')).toBeNull();
      // Запоздалый drop отменённого жеста не должен применить старую цель.
      drag(
        "drop",
        screen.getByRole("list", { name: "Порядок разделов" }),
        dataTransfer,
        110,
      );
      expect(customizationOrder()).toEqual(before);
    },
  );

  it("игнорирует внешний drag даже при правдоподобных id и MIME", () => {
    navigationFixture(false, true);
    openCustomization();
    const { list } = dragGeometry();
    const before = customizationOrder();
    const external = dragDataTransfer();
    external.setData("text/plain", "settings");
    external.setData("application/x-realize-navigation-item", "settings");
    drag("dragOver", list, external, 110);
    drag("drop", list, external, 110);
    expect(customizationOrder()).toEqual(before);
    expect(external.setDragImage).not.toHaveBeenCalled();
    expect(document.querySelector('[data-drag-preview="true"]')).toBeNull();
  });

  it("закрывает удалённый host-раздел и не открывает его сам при возвращении registry", () => {
    const openHome = vi.fn();
    const navigation: SystemAdminNavigationItem[] = [
      { id: "home", label: "Главная", icon: null, onSelect: openHome },
      { id: "tasks", label: "Задачи", icon: null },
    ];
    const props = {
      navigation,
      activeNavigationId: "tasks",
      theme: "light" as const,
      navigationPreferences: {
        order: ["home", "tasks"],
        hidden: [] as string[],
      },
      onNavigationPreferencesChange: vi.fn(),
    };
    const { rerender } = render(h(SystemAdminNavigation, props));
    fireEvent.click(screen.getByRole("button", { name: "Главная" }));
    advance(20);
    expect(screen.getByRole("dialog", { name: "Главная" })).toBeTruthy();
    rerender(
      h(SystemAdminNavigation, {
        ...props,
        navigation: navigation.filter((item) => item.id !== "home"),
      }),
    );
    advance(20);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(h(SystemAdminNavigation, props));
    advance(300);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Главная" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(openHome).not.toHaveBeenCalled();
    expect(props.onNavigationPreferencesChange).not.toHaveBeenCalled();
  });
});
