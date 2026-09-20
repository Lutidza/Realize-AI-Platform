/**
 * @file tests/int/task-manager-navigation.int.spec.ts
 * @version 1.2.0
 * @date 2026-09-18
 * @description Проверяет ссылки задач и просмотр контейнеров рабочей среды без изменения выбранных задач.
 * @see documentation/specifications/task-management.md
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initialPrototypeState } from "../../src/components/admin/task-manager/reference/taskManager.fixtures";
import { defaultTaskFilters } from "../../src/components/admin/task-manager/reference/taskWorkbench.constants";
import { useTaskWorkbench } from "../../src/components/admin/task-manager/reference/useTaskWorkbench.hook";
import { useTaskHierarchy } from "../../src/components/admin/task-manager/reference/useTaskHierarchy.hook";
import type { TaskLocation } from "../../src/components/admin/task-manager/reference/taskManager.types";

const originalUrl = window.location.href;

function navigationScenario() {
  const state = structuredClone(initialPrototypeState);
  const localTask = {
    ...structuredClone(state.tasks[0]),
    id: "local-task",
    projectId: "p-realize",
    listId: "l-p-realize",
    parentId: null,
    archived: false,
  };
  const archivedTask = {
    ...structuredClone(localTask),
    id: "archived-task",
    archived: true,
  };
  state.workspaces.push({
    ...structuredClone(state.workspaces[0]),
    id: "w-remote",
    name: "Другая команда",
    description: "Независимая рабочая среда",
    initials: "ДК",
  });
  state.projects.push({
    id: "p-remote",
    workspaceId: "w-remote",
    name: "Другой проект",
    description: "",
    initials: "ДП",
  });
  state.lists.push({
    id: "l-remote",
    projectId: "p-remote",
    folderId: null,
    name: "Другой список",
    description: "",
  });
  const remoteTask = {
    ...structuredClone(localTask),
    id: "remote-task",
    projectId: "p-remote",
    listId: "l-remote",
  };
  state.tasks = [localTask, archivedTask, remoteTask];
  return { state, localTask, archivedTask, remoteTask };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/admin/task-manager/reference");
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", originalUrl);
});

describe("Навигация референса по задачам", () => {
  it("начальная ссылка открывает архивную задачу в её Workspace и List", () => {
    const { state, remoteTask } = navigationScenario();
    remoteTask.archived = true;
    window.history.replaceState(null, "", `#task=${remoteTask.id}`);

    const { result } = renderHook(() => useTaskWorkbench(state, [], "light"));

    expect(result.current.selectedTaskId).toBe(remoteTask.id);
    expect(result.current.workspaceId).toBe("w-remote");
    expect(result.current.projectId).toBe("p-remote");
    expect(result.current.location).toEqual({ kind: "list", id: "l-remote" });
    expect(result.current.archived).toBe(true);
    expect(result.current.tasks.map((task) => task.id)).toEqual([
      remoteTask.id,
    ]);
  });

  it("hashchange использует актуальный state и очищает чужие фильтры и bulk-выбор", () => {
    const { state, localTask, remoteTask } = navigationScenario();
    const initialState = {
      ...state,
      tasks: state.tasks.filter((task) => task.id !== remoteTask.id),
    };
    const { result, rerender } = renderHook(
      ({ snapshot }) => useTaskWorkbench(snapshot, [], "light"),
      { initialProps: { snapshot: initialState } },
    );
    act(() => {
      result.current.setFilters({
        ...defaultTaskFilters,
        query: "Нет совпадений",
      });
      result.current.setSelected([localTask.id]);
    });
    // Задача появилась после mount; обработчик ссылки не должен читать старый снимок.
    rerender({ snapshot: state });
    act(() => {
      window.history.replaceState(null, "", `#task=${remoteTask.id}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(result.current.selectedTaskId).toBe(remoteTask.id);
    expect(result.current.workspaceId).toBe("w-remote");
    expect(result.current.location).toEqual({ kind: "list", id: "l-remote" });
    expect(result.current.selected).toEqual([]);
    expect(result.current.filters).toEqual(defaultTaskFilters);
    expect(result.current.tasks.map((task) => task.id)).toEqual([
      remoteTask.id,
    ]);

    act(() => {
      window.history.replaceState(null, "", window.location.pathname);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.selectedTaskId).toBeNull();
    expect(result.current.location).toEqual({ kind: "list", id: "l-remote" });
  });

  it("открытие задачи того же контейнера переключает архив в обе стороны", () => {
    const { state, localTask, archivedTask } = navigationScenario();
    const { result } = renderHook(() => useTaskWorkbench(state, [], "light"));
    act(() => {
      result.current.setFilters({ ...defaultTaskFilters, status: "done" });
      result.current.setSelected([localTask.id]);
    });
    act(() => result.current.onOpenTask(archivedTask.id));

    expect(result.current.archived).toBe(true);
    expect(result.current.selectedTaskId).toBe(archivedTask.id);
    expect(result.current.location).toEqual({
      kind: "list",
      id: "l-p-realize",
    });
    expect(result.current.tasks.map((task) => task.id)).toEqual([
      archivedTask.id,
    ]);
    expect(result.current.filters).toEqual(defaultTaskFilters);
    expect(result.current.selected).toEqual([]);

    act(() => result.current.onOpenTask(localTask.id));

    expect(result.current.archived).toBe(false);
    expect(result.current.selectedTaskId).toBe(localTask.id);
    expect(result.current.tasks.map((task) => task.id)).toEqual([localTask.id]);
    expect(window.location.hash).toBe(`#task=${localTask.id}`);
  });
});

describe("Просмотр проектов и контейнеров", () => {
  it("скрывает контейнер персонально и возвращает его через показ скрытых без изменения задач", () => {
    const { state } = navigationScenario();
    const snapshot = structuredClone(state);
    const { result } = renderHook(() =>
      useTaskHierarchy({
        state,
        location: { kind: "workspace", id: "w-realize" },
        hiddenIds: ["link:task-location-project-p-store"],
      }),
    );
    expect(
      result.current.nodes.some((node) => node.location.id === "p-store"),
    ).toBe(false);
    expect(result.current.hiddenCount).toBe(1);
    act(() => result.current.setShowHidden(true));
    expect(
      result.current.nodes.find((node) => node.location.id === "p-store")
        ?.hidden,
    ).toBe(true);
    expect(state).toEqual(snapshot);
  });
  it("показывает плоский список проектов только выбранного workspace с числом активных задач", () => {
    const { state } = navigationScenario();
    const { result } = renderHook(() =>
      useTaskHierarchy({
        state,
        location: { kind: "workspace", id: "w-realize" },
      }),
    );

    expect(result.current.root).toBe(true);
    expect(result.current.nodes.map((node) => node.location)).toEqual([
      { kind: "project", id: "p-realize" },
      { kind: "project", id: "p-store" },
      { kind: "project", id: "p-content" },
    ]);
    expect(result.current.nodes.map((node) => node.count)).toEqual([1, 0, 0]);
    expect(result.current.parent).toBeUndefined();
  });

  it("просмотр проекта, папки и вложенной папки с возвратом не меняет выбранные задачи", () => {
    const { state } = navigationScenario();
    const { result } = renderHook(() => {
      const workbench = useTaskWorkbench(state, [], "light");
      return {
        workbench,
        hierarchy: useTaskHierarchy({ state, location: workbench.location }),
      };
    });
    const selectedLocation = result.current.workbench.location;
    const selectedTasks = result.current.workbench.tasks.map((task) => task.id);

    act(() =>
      result.current.hierarchy.browse({ kind: "project", id: "p-realize" }),
    );
    expect(result.current.hierarchy.nodes.map((node) => node.location)).toEqual(
      [
        { kind: "folder", id: "f-interface" },
        { kind: "list", id: "l-p-realize" },
      ],
    );

    act(() =>
      result.current.hierarchy.browse({ kind: "folder", id: "f-interface" }),
    );
    expect(result.current.hierarchy.nodes.map((node) => node.location)).toEqual(
      [
        { kind: "folder", id: "f-references" },
        { kind: "list", id: "l-interface" },
      ],
    );

    act(() =>
      result.current.hierarchy.browse({ kind: "folder", id: "f-references" }),
    );
    expect(result.current.hierarchy.nodes.map((node) => node.location)).toEqual(
      [{ kind: "list", id: "l-references" }],
    );
    expect(result.current.hierarchy.browsePath.map((part) => part.id)).toEqual([
      "w-realize",
      "p-realize",
      "f-interface",
      "f-references",
    ]);

    for (const parentId of ["f-interface", "p-realize", "w-realize"]) {
      const parent = result.current.hierarchy.parent;
      expect(parent?.id).toBe(parentId);
      act(() => result.current.hierarchy.browse(parent!));
    }

    expect(result.current.hierarchy.root).toBe(true);
    expect(result.current.workbench.location).toEqual(selectedLocation);
    expect(result.current.workbench.tasks.map((task) => task.id)).toEqual(
      selectedTasks,
    );
  });

  it("выбранный вложенный список открывает его родителя и не смешивает содержимое других папок", () => {
    const { state } = navigationScenario();
    const { result } = renderHook(() =>
      useTaskHierarchy({
        state,
        location: { kind: "list", id: "l-references" },
      }),
    );

    expect(result.current.context).toMatchObject({
      kind: "folder",
      id: "f-references",
    });
    expect(result.current.parent).toMatchObject({
      kind: "folder",
      id: "f-interface",
    });
    expect(result.current.workspace?.id).toBe("w-realize");
    expect(result.current.nodes.map((node) => node.location.id)).toEqual([
      "l-references",
    ]);
  });

  it("предлагает создание проекта у workspace и папки или списка в текущем контейнере", () => {
    const { state } = navigationScenario();
    const { result } = renderHook(() =>
      useTaskHierarchy({
        state,
        location: { kind: "workspace", id: "w-realize" },
      }),
    );

    expect(result.current.creationOptions).toEqual([
      {
        label: "Создать проект",
        creation: { kind: "project", workspaceId: "w-realize" },
      },
    ]);
    act(() => result.current.browse({ kind: "project", id: "p-realize" }));
    expect(result.current.creationOptions).toEqual([
      {
        label: "Создать папку",
        creation: { kind: "folder", projectId: "p-realize", parentId: null },
      },
      {
        label: "Создать список",
        creation: { kind: "list", projectId: "p-realize", folderId: null },
      },
    ]);
    act(() => result.current.browse({ kind: "folder", id: "f-interface" }));
    expect(result.current.creationOptions).toEqual([
      {
        label: "Создать папку",
        creation: {
          kind: "folder",
          projectId: "p-realize",
          parentId: "f-interface",
        },
      },
      {
        label: "Создать список",
        creation: {
          kind: "list",
          projectId: "p-realize",
          folderId: "f-interface",
        },
      },
    ]);
  });

  it("поиск учитывает регистр и пробелы, ограничен текущим уровнем и очищается при входе в контейнер", () => {
    const { state } = navigationScenario();
    const { result } = renderHook(() =>
      useTaskHierarchy({
        state,
        location: { kind: "workspace", id: "w-realize" },
      }),
    );

    act(() => result.current.setQuery("  МАГАЗИН  "));
    expect(result.current.nodes.map((node) => node.location.id)).toEqual([
      "p-store",
    ]);
    act(() => result.current.browse({ kind: "project", id: "p-realize" }));
    expect(result.current.query).toBe("");
    act(() => result.current.setQuery("референсы"));
    expect(result.current.nodes).toEqual([]);
    act(() => result.current.browse({ kind: "folder", id: "f-interface" }));
    expect(result.current.query).toBe("");
    expect(result.current.nodes.map((node) => node.location.id)).toEqual([
      "f-references",
      "l-interface",
    ]);
  });

  it("внешний выбор соседнего списка очищает поиск даже при неизменном родителе", () => {
    const { state } = navigationScenario();
    state.lists.push({
      id: "l-second",
      projectId: "p-realize",
      folderId: null,
      name: "План",
      description: "",
    });
    const { result, rerender } = renderHook(
      ({ location }: { location: TaskLocation }) =>
        useTaskHierarchy({ state, location }),
      {
        initialProps: {
          location: { kind: "list", id: "l-p-realize" } as TaskLocation,
        },
      },
    );
    act(() => result.current.setQuery("несуществующий список"));
    expect(result.current.nodes).toEqual([]);

    rerender({ location: { kind: "list", id: "l-second" } });

    expect(result.current.context?.id).toBe("p-realize");
    expect(result.current.query).toBe("");
    expect(result.current.nodes.map((node) => node.location.id)).toContain(
      "l-second",
    );
  });

  it("смена workspace и возврат не восстанавливают устаревший просмотр папки и поиск", () => {
    const { state } = navigationScenario();
    const { result, rerender } = renderHook(
      ({ location }: { location: TaskLocation }) =>
        useTaskHierarchy({ state, location }),
      {
        initialProps: {
          location: { kind: "workspace", id: "w-realize" } as TaskLocation,
        },
      },
    );
    act(() => result.current.browse({ kind: "folder", id: "f-interface" }));
    act(() => result.current.setQuery("референсы"));

    rerender({ location: { kind: "workspace", id: "w-remote" } });
    expect(result.current.workspace?.id).toBe("w-remote");
    expect(result.current.root).toBe(true);
    expect(result.current.query).toBe("");
    expect(result.current.nodes.map((node) => node.location.id)).toEqual([
      "p-remote",
    ]);

    rerender({ location: { kind: "workspace", id: "w-realize" } });
    expect(result.current.root).toBe(true);
    expect(result.current.context?.id).toBe("w-realize");
    expect(result.current.query).toBe("");
    expect(result.current.nodes.map((node) => node.location.id)).toEqual([
      "p-realize",
      "p-store",
      "p-content",
    ]);
  });

  it("пустая рабочая среда остаётся выбранной и разрешает создать первый проект", () => {
    const { state } = navigationScenario();
    const { result } = renderHook(() =>
      useTaskHierarchy({
        state,
        location: { kind: "workspace", id: "w-personal" },
      }),
    );

    expect(result.current.workspace?.id).toBe("w-personal");
    expect(result.current.root).toBe(true);
    expect(result.current.nodes).toEqual([]);
    expect(result.current.creationOptions).toEqual([
      {
        label: "Создать проект",
        creation: { kind: "project", workspaceId: "w-personal" },
      },
    ]);
  });
});
