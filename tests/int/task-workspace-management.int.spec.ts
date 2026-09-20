/**
 * @file tests/int/task-workspace-management.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Проверяет атомарное управление средами, роли доступа, конфликты и независимость архива от запусков.
 * @see documentation/specifications/task-management-execution.md
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { initialPrototypeState } from "../../src/components/admin/task-manager/reference/taskManager.fixtures";
import { createPrototypeStore } from "../../src/components/admin/task-manager/reference/taskManager.store";
import { workspaceDefaults } from "../../src/components/admin/task-manager/reference/taskWorkspace.constants";
import {
  getWorkspaceAccess,
  getWorkspaceDraft,
} from "../../src/components/admin/task-manager/reference/taskWorkspace.access";
import { getTaskNavigationFavoriteLinks } from "../../src/components/admin/task-manager/reference/taskManager.navigationFavorites";
import { useWorkspaceManager } from "../../src/components/admin/task-manager/reference/useWorkspaceManager.hook";
import { useTaskWorkbench } from "../../src/components/admin/task-manager/reference/useTaskWorkbench.hook";
import { useWorkspaceSwitcher } from "../../src/components/admin/task-manager/reference/useWorkspaceSwitcher.hook";

const makeStore = () =>
  createPrototypeStore(structuredClone(initialPrototypeState));
afterEach(cleanup);

describe("Переключатель рабочих сред", () => {
  function catalogState() {
    const state = structuredClone(initialPrototypeState);
    state.workspaces = Array.from({ length: 25 }, (_, index) => ({
      ...structuredClone(state.workspaces[0]),
      id: `workspace-${index}`,
      name: `Команда ${String(index + 1).padStart(2, "0")}`,
    }));
    return state;
  }
  it("раскрывает каталог порциями, сохраняя окно, и сбрасывает выдачу при закрытии", () => {
    const state = catalogState();
    const { result } = renderHook(() => useWorkspaceSwitcher(state));
    act(() => result.current.setOpen(true));
    expect(result.current.workspaces).toHaveLength(10);
    expect(result.current.remaining).toBe(15);
    act(() => result.current.showMore());
    expect(result.current.open).toBe(true);
    expect(result.current.workspaces).toHaveLength(20);
    act(() => result.current.showMore());
    expect(result.current.workspaces).toHaveLength(25);
    expect(result.current.hasMore).toBe(false);
    act(() => result.current.setOpen(false));
    act(() => result.current.setOpen(true));
    expect(result.current.workspaces).toHaveLength(10);
  });
  it("ищет за пределами первой порции, исключая архивные и недоступные среды", () => {
    const state = catalogState();
    state.workspaces[22].archived = true;
    state.workspaces[23].ownerId = "anna";
    state.workspaces[23].members = [];
    const { result } = renderHook(() => useWorkspaceSwitcher(state));
    act(() => result.current.showMore());
    act(() => result.current.setQuery("  КОМАНДА 25  "));
    expect(result.current.workspaces.map((entry) => entry.id)).toEqual([
      "workspace-24",
    ]);
    expect(result.current.hasMore).toBe(false);
    act(() => result.current.setQuery("Команда 23"));
    expect(result.current.workspaces).toEqual([]);
    act(() => result.current.setQuery("Команда 24"));
    expect(result.current.workspaces).toEqual([]);
    act(() => result.current.setQuery(""));
    expect(result.current.workspaces).toHaveLength(10);
  });
});

function managerScenario() {
  const store = makeStore();
  const selectWorkspace = vi.fn();
  const rendered = renderHook(() => {
    const state = useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getServerSnapshot,
    );
    return useWorkspaceManager(state, store.dispatch, selectWorkspace);
  });
  act(() => rendered.result.current.openSettings("w-personal"));
  return { ...rendered, store, selectWorkspace };
}

describe("Рабочие среды: переходы и сохранение черновика", () => {
  it("открывает созданную среду в том же событии, до следующего render", () => {
    const store = makeStore();
    const { result } = renderHook(() => {
      const state = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getServerSnapshot,
      );
      return useTaskWorkbench(state, [], "light", store.getSnapshot);
    });
    act(() => {
      const created = store.dispatch({
        type: "workspace/create",
        draft: { ...workspaceDefaults, name: "Новая команда" },
      });
      expect(created.location).toBeDefined();
      result.current.navigateLocation(created.location!);
    });
    expect(result.current.locationInfo?.name).toBe("Новая команда");
    expect(result.current.workspaceAccess.canWrite).toBe(true);
  });
  it("save-and-leave не возвращает старые поля и revision при смене вкладки", () => {
    const { result, store } = managerScenario();
    act(() => result.current.composer.change("name", "  Продуктовая среда  "));
    act(() => result.current.changeTab("members"));
    expect(result.current.leaveOpen).toBe(true);
    expect(result.current.tab).toBe("general");
    act(() => result.current.saveAndLeave());
    expect(result.current.tab).toBe("members");
    expect(result.current.composer.draft.name).toBe("Продуктовая среда");
    expect(result.current.composer.dirty).toBe(false);
    act(() => result.current.changeTab("general"));
    act(() => result.current.composer.change("description", "Новый контекст"));
    act(() => result.current.composer.save());
    expect(store.getSnapshot().workspaces[1]).toMatchObject({
      name: "Продуктовая среда",
      description: "Новый контекст",
      revision: 3,
    });
  });

  it("отмена перехода сохраняет ввод; отказ от сохранения оставляет данные store", () => {
    const { result, store } = managerScenario();
    act(() => result.current.composer.change("name", "Черновик"));
    act(() => result.current.openCatalog());
    act(() => result.current.cancelLeave());
    expect(result.current.screen).toBe("settings");
    expect(result.current.composer.draft.name).toBe("Черновик");
    act(() => result.current.openCatalog());
    act(() => result.current.discardAndLeave());
    expect(result.current.screen).toBe("catalog");
    expect(store.getSnapshot().workspaces[1].name).toBe("Личная среда");
  });

  it("конфликт блокирует переход и сохраняет введённые поля", () => {
    const { result, store } = managerScenario();
    act(() => result.current.composer.change("description", "Мой черновик"));
    act(() =>
      store.dispatch({
        type: "workspace/member",
        workspaceId: "w-personal",
        expectedRevision: 1,
        actorId: "anna",
        role: "admin",
      }),
    );
    act(() => result.current.openCatalog());
    act(() => result.current.saveAndLeave());
    expect(result.current.screen).toBe("settings");
    expect(result.current.leaveOpen).toBe(false);
    expect(result.current.composer.draft.description).toBe("Мой черновик");
    expect(result.current.composer.error).not.toBe("");
    expect(store.getSnapshot().workspaces[1].description).not.toBe(
      "Мой черновик",
    );
  });

  it("переход к другой среде после сохранения загружает именно её настройки", () => {
    const { result, store, selectWorkspace } = managerScenario();
    act(() => result.current.composer.change("name", "Личные исследования"));
    act(() => result.current.openSettings("w-realize"));
    act(() => result.current.saveAndLeave());
    expect(store.getSnapshot().workspaces[1].name).toBe("Личные исследования");
    expect(result.current.workspace?.id).toBe("w-realize");
    expect(result.current.composer.draft.name).toBe("Realize team");
    expect(selectWorkspace).toHaveBeenLastCalledWith("w-realize");
  });
});

describe("Рабочие среды: единая модель управления", () => {
  it("создаёт полную среду с владельцем и настройками без лишних контейнеров", () => {
    const store = makeStore();
    const result = store.dispatch({
      type: "workspace/create",
      draft: {
        ...workspaceDefaults,
        name: "  Исследования  ",
        description: "Команда",
        color: "green",
        icon: "rocket",
        timezone: "UTC",
        workingDays: [5, 1],
        visibility: "internal",
      },
    });
    expect(result.ok).toBe(true);
    const workspace = store
      .getSnapshot()
      .workspaces.find((item) => item.id === result.location?.id)!;
    expect(workspace).toMatchObject({
      name: "Исследования",
      ownerId: "gio",
      members: [],
      color: "green",
      icon: "rocket",
      timezone: "UTC",
      workingDays: [1, 5],
      visibility: "internal",
      archived: false,
      revision: 1,
    });
    expect(store.getSnapshot().projects).toEqual(
      initialPrototypeState.projects,
    );
  });

  it.each([
    { name: "  " },
    { timezone: "Broken/Zone" },
    { workingDays: [] },
    { workingDays: [1, 1] },
    { workingDays: [8] },
    { name: "realize TEAM" },
  ])("не публикует частичную среду при невалидном вводе %o", (patch) => {
    const store = makeStore();
    const result = store.dispatch({
      type: "workspace/create",
      draft: { ...workspaceDefaults, name: "Новая", ...patch },
    });
    expect(result.ok).toBe(false);
    expect(store.getSnapshot().workspaces).toEqual(
      initialPrototypeState.workspaces,
    );
  });

  it("сохраняет настройки по revision, устаревшая запись не затирает новую", () => {
    const store = makeStore();
    const before = store.getSnapshot().workspaces[0];
    const draft = { ...getWorkspaceDraft(before), name: "Команда продукта" };
    expect(
      store.dispatch({
        type: "workspace/save",
        workspaceId: before.id,
        expectedRevision: 1,
        draft,
      }).ok,
    ).toBe(true);
    const saved = store.getSnapshot().workspaces[0];
    expect(saved.revision).toBe(2);
    expect(saved.members).toEqual(before.members);
    expect(
      store.dispatch({
        type: "workspace/save",
        workspaceId: before.id,
        expectedRevision: 1,
        draft: { ...draft, name: "Старые поля" },
      }).ok,
    ).toBe(false);
    expect(store.getSnapshot().workspaces[0]).toEqual(saved);
  });

  it("owner и admin управляют, member пишет задачи, guest только читает", () => {
    const workspace = structuredClone(initialPrototypeState.workspaces[0]);
    workspace.members = [
      { actorId: "anna", role: "admin" },
      { actorId: "developer", role: "member" },
      { actorId: "tester", role: "guest" },
    ];
    expect(
      getWorkspaceAccess({ currentActorId: "gio" }, workspace),
    ).toMatchObject({ canRead: true, canWrite: true, canManage: true });
    expect(
      getWorkspaceAccess({ currentActorId: "anna" }, workspace),
    ).toMatchObject({ canWrite: true, canManage: true });
    expect(
      getWorkspaceAccess({ currentActorId: "developer" }, workspace),
    ).toMatchObject({ canWrite: true, canManage: false });
    expect(
      getWorkspaceAccess({ currentActorId: "tester" }, workspace),
    ).toMatchObject({ canRead: true, canWrite: false, canManage: false });
    expect(
      getWorkspaceAccess({ currentActorId: "designer" }, workspace).canRead,
    ).toBe(false);
    workspace.visibility = "internal";
    expect(
      getWorkspaceAccess({ currentActorId: "designer" }, workspace),
    ).toMatchObject({ canRead: true, canWrite: false });
  });

  it("прямой dispatch не позволяет гостю сохранить задачу или настройки", () => {
    const state = structuredClone(initialPrototypeState);
    state.currentActorId = "anna";
    state.workspaces[0].members = [{ actorId: "anna", role: "guest" }];
    const store = createPrototypeStore(state);
    expect(
      store.dispatch({
        type: "task/update",
        taskId: state.tasks[0].id,
        patch: { title: "Нельзя" },
      }).ok,
    ).toBe(false);
    expect(
      store.dispatch({
        type: "workspace/save",
        workspaceId: "w-realize",
        expectedRevision: 1,
        draft: { ...getWorkspaceDraft(state.workspaces[0]), name: "Нельзя" },
      }).ok,
    ).toBe(false);
    expect(store.getSnapshot().tasks).toEqual(state.tasks);
    expect(store.getSnapshot().workspaces).toEqual(state.workspaces);
  });

  it("добавляет агента, меняет роль и удаляет участника, сохраняя владельца", () => {
    const store = makeStore();
    const command = (
      actorId: string,
      role: "admin" | "member" | "guest" | null,
    ) =>
      store.dispatch({
        type: "workspace/member",
        workspaceId: "w-personal",
        expectedRevision: store.getSnapshot().workspaces[1].revision,
        actorId,
        role,
      });
    expect(command("developer", "member").ok).toBe(true);
    expect(store.getSnapshot().workspaces[1].members).toEqual([
      { actorId: "developer", role: "member" },
    ]);
    expect(command("developer", "guest").ok).toBe(true);
    expect(command("gio", null).ok).toBe(false);
    expect(command("unknown", "admin").ok).toBe(false);
    expect(command("developer", null).ok).toBe(true);
    expect(store.getSnapshot().workspaces[1].members).toEqual([]);
  });

  it.each(["queued", "blocked", "running", "paused"] as const)(
    "не архивирует среду с запуском %s",
    (runState) => {
      const state = structuredClone(initialPrototypeState);
      state.tasks[0].run.state = runState;
      const store = createPrototypeStore(state);
      const result = store.dispatch({
        type: "workspace/archive",
        workspaceId: "w-realize",
        expectedRevision: 1,
        archived: true,
      });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("запуски");
      expect(store.getSnapshot().workspaces).toEqual(state.workspaces);
      expect(store.getSnapshot().tasks).toEqual(state.tasks);
    },
  );

  it("архив блокирует запись, сохраняет содержимое, restore не запускает чужую очередь", () => {
    const state = structuredClone(initialPrototypeState);
    state.tasks.forEach((task) => {
      task.run.state = "idle";
    });
    const store = createPrototypeStore(state);
    expect(
      store.dispatch({
        type: "workspace/archive",
        workspaceId: "w-realize",
        expectedRevision: 1,
        archived: true,
      }).ok,
    ).toBe(true);
    expect(store.getSnapshot().tasks).toEqual(state.tasks);
    expect(
      store.dispatch({
        type: "task/update",
        taskId: state.tasks[0].id,
        patch: { title: "Нельзя" },
      }).ok,
    ).toBe(false);
    expect(
      store.dispatch({
        type: "hierarchy/create",
        location: { kind: "project", workspaceId: "w-realize" },
        name: "Нельзя",
        description: "",
      }).ok,
    ).toBe(false);
    expect(
      store.dispatch({
        type: "workspace/archive",
        workspaceId: "w-realize",
        expectedRevision: 2,
        archived: false,
      }).ok,
    ).toBe(true);
    expect(store.getSnapshot().tasks).toEqual(state.tasks);
    expect(store.getSnapshot().workspaces[0].revision).toBe(3);
  });

  it("изменения среды не продвигают queued/blocked задачи других сред", () => {
    const state = structuredClone(initialPrototypeState);
    state.tasks[0].run.state = "queued";
    const store = createPrototypeStore(state);
    expect(
      store.dispatch({
        type: "workspace/member",
        workspaceId: "w-personal",
        expectedRevision: 1,
        actorId: "anna",
        role: "guest",
      }).ok,
    ).toBe(true);
    expect(
      store.dispatch({
        type: "workspace/archive",
        workspaceId: "w-personal",
        expectedRevision: 2,
        archived: true,
      }).ok,
    ).toBe(true);
    expect(
      store.dispatch({
        type: "workspace/archive",
        workspaceId: "w-personal",
        expectedRevision: 3,
        archived: false,
      }).ok,
    ).toBe(true);
    expect(store.getSnapshot().tasks).toEqual(state.tasks);
  });

  it("не отзывает доступ участника незавершённого запуска", () => {
    const state = structuredClone(initialPrototypeState);
    state.tasks[0].run.state = "running";
    state.tasks[0].roles.executor = ["developer"];
    const store = createPrototypeStore(state);
    expect(
      store.dispatch({
        type: "workspace/member",
        workspaceId: "w-realize",
        expectedRevision: 1,
        actorId: "developer",
        role: null,
      }).ok,
    ).toBe(false);
    expect(store.getSnapshot().workspaces).toEqual(state.workspaces);
  });

  it("избранное исключает архивные и недоступные среды вместе с контейнерами", () => {
    const state = structuredClone(initialPrototypeState);
    state.currentActorId = "anna";
    const initial = getTaskNavigationFavoriteLinks(state, () => undefined);
    expect(initial.some((entry) => entry.id.includes("w-personal"))).toBe(
      false,
    );
    state.workspaces[0].archived = true;
    expect(getTaskNavigationFavoriteLinks(state, () => undefined)).toEqual([]);
  });
});
