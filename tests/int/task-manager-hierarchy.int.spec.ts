/**
 * @file tests/int/task-manager-hierarchy.int.spec.ts
 * @version 1.1.1
 * @date 2026-09-18
 * @description Проверяет атомарное создание контейнеров, принадлежность задач и целостность вложенности.
 * @see documentation/specifications/task-management-execution.md
 */

import { describe, expect, it } from "vitest";
import { initialPrototypeState } from "../../src/components/admin/task-manager/reference/taskManager.fixtures";
import {
  createTaskDraft,
  taskToDraft,
} from "../../src/components/admin/task-manager/reference/taskManager.draft";
import {
  getLocationInfo,
  getLocationPath,
  getLocationTasks,
  getTaskLocation,
} from "../../src/components/admin/task-manager/reference/taskManager.hierarchy";
import { prototypeReducer } from "../../src/components/admin/task-manager/reference/taskManager.reducer";
import type {
  HierarchyCreation,
  PrototypeState,
} from "../../src/components/admin/task-manager/reference/taskManager.types";

function scenario(): PrototypeState {
  const state = structuredClone(initialPrototypeState);
  for (const task of state.tasks) task.run = { state: "idle", attempt: 0 };
  return state;
}

function create(
  state: PrototypeState,
  location: HierarchyCreation,
  name = "Новый контейнер",
) {
  return prototypeReducer(state, {
    type: "hierarchy/create",
    location,
    name,
    description: " Описание ",
  });
}

function task(state: PrototypeState, id: string) {
  return state.tasks.find((item) => item.id === id)!;
}

describe("Иерархия локального reference задач", () => {
  it("сохраняет 14 задач fixtures и вычисляет полный путь вложенного списка", () => {
    expect(initialPrototypeState.tasks).toHaveLength(14);
    expect(
      getLocationPath(initialPrototypeState, {
        kind: "list",
        id: "l-references",
      }).map(({ kind, id }) => ({ kind, id })),
    ).toEqual([
      { kind: "workspace", id: "w-realize" },
      { kind: "project", id: "p-realize" },
      { kind: "folder", id: "f-interface" },
      { kind: "folder", id: "f-references" },
      { kind: "list", id: "l-references" },
    ]);
    expect(
      getLocationInfo(initialPrototypeState, {
        kind: "folder",
        id: "f-references",
      }),
    ).toEqual({ name: "Референсы", description: "" });
    expect(
      getLocationInfo(initialPrototypeState, { kind: "list", id: "missing" }),
    ).toBeUndefined();
    expect(
      getTaskLocation(
        initialPrototypeState,
        task(initialPrototypeState, "TM-102"),
      ),
    ).toEqual({ kind: "list", id: "l-references" });
  });

  it("Workspace создаётся пустым; сброс не меняет исходные fixtures", () => {
    const source = scenario();
    const result = create(source, { kind: "workspace" }, "  Новый Workspace  ");
    expect(result.lastResult.ok).toBe(true);
    const workspace = result.workspaces.at(-1)!;
    expect(workspace).toMatchObject({
      name: "Новый Workspace",
      description: "Описание",
    });
    expect(result.lastResult.location).toEqual({
      kind: "workspace",
      id: workspace.id,
    });
    expect(result.projects).toEqual(source.projects);
    expect(result.folders).toEqual(source.folders);
    expect(result.lists).toEqual(source.lists);
    expect(result.tasks).toEqual(source.tasks);
    expect(source.workspaces).toEqual(initialPrototypeState.workspaces);
    const reset = prototypeReducer(result, { type: "reset" });
    expect(reset.workspaces).toEqual(initialPrototypeState.workspaces);
    expect(reset.folders).toEqual(initialPrototypeState.folders);
    expect(reset.lists).toEqual(initialPrototypeState.lists);
  });

  it("создаёт всю цепочку и начальный список проекта без неявного создания задач", () => {
    let state = create(
      scenario(),
      { kind: "project", workspaceId: "w-personal" },
      "Дом",
    );
    const projectId = state.lastResult.location!.id;
    expect(
      state.lists.find((list) => list.id === `l-${projectId}`),
    ).toMatchObject({ projectId, folderId: null, name: "Задачи" });
    state = create(
      state,
      { kind: "folder", projectId, parentId: null },
      "Ремонт",
    );
    const folderId = state.lastResult.location!.id;
    state = create(
      state,
      { kind: "folder", projectId, parentId: folderId },
      "Кухня",
    );
    const childId = state.lastResult.location!.id;
    expect(state.lists.filter((list) => list.folderId === childId)).toEqual([]);
    state = create(
      state,
      { kind: "list", projectId, folderId: childId },
      "Покупки",
    );
    const listId = state.lastResult.location!.id;
    expect(
      getLocationPath(state, { kind: "list", id: listId }).map(
        (entry) => entry.name,
      ),
    ).toEqual(["Личная среда", "Дом", "Ремонт", "Кухня", "Покупки"]);
    expect(state.tasks).toHaveLength(initialPrototypeState.tasks.length);
    state = prototypeReducer(state, {
      type: "task/create",
      draft: {
        ...createTaskDraft(projectId, undefined, listId),
        title: "Выбрать мебель",
      },
    });
    expect(state.lastResult.ok).toBe(true);
    expect(
      getLocationTasks(state, { kind: "workspace", id: "w-personal" }).map(
        (item) => item.title,
      ),
    ).toEqual(["Выбрать мебель"]);
  });

  it("проект принадлежит выбранному Workspace без промежуточных контейнеров", () => {
    const state = create(
      scenario(),
      { kind: "project", workspaceId: "w-realize" },
      "Новый проект",
    );
    const projectId = state.lastResult.location!.id;
    expect(
      state.projects.find((project) => project.id === projectId)?.workspaceId,
    ).toBe("w-realize");
    expect(
      getLocationPath(state, { kind: "list", id: `l-${projectId}` }).map(
        (item) => item.kind,
      ),
    ).toEqual(["workspace", "project", "list"]);
  });

  it("название проекта уникально внутри Workspace, ошибки не оставляют частичных контейнеров", () => {
    const source = scenario();
    const state = create(
      source,
      { kind: "project", workspaceId: "w-realize" },
      "Тест",
    );
    const rejected = create(
      state,
      { kind: "project", workspaceId: "w-realize" },
      " тест ",
    );
    expect(rejected.lastResult.ok).toBe(false);
    expect(rejected.projects).toEqual(state.projects);
    expect(rejected.lists).toEqual(state.lists);
    expect(rejected.tasks).toEqual(state.tasks);
    const allowed = create(
      state,
      { kind: "project", workspaceId: "w-personal" },
      "Тест",
    );
    expect(allowed.lastResult.ok).toBe(true);
    expect(create(source, { kind: "workspace" }, " ").lastResult.ok).toBe(
      false,
    );
    expect(
      create(source, { kind: "workspace" }, "x".repeat(101)).lastResult.ok,
    ).toBe(false);
  });

  it.each<HierarchyCreation>([
    { kind: "project", workspaceId: "missing" },
    { kind: "folder", projectId: "missing", parentId: null },
    { kind: "folder", projectId: "p-store", parentId: "f-interface" },
    { kind: "folder", projectId: "p-realize", parentId: "missing" },
    { kind: "list", projectId: "p-store", folderId: "f-interface" },
    { kind: "list", projectId: "p-realize", folderId: "missing" },
  ])("отвергает чужого или отсутствующего родителя %j", (location) => {
    const source = scenario();
    const rejected = create(source, location);
    expect(rejected.lastResult.ok).toBe(false);
    expect({
      ...rejected,
      notice: source.notice,
      lastResult: source.lastResult,
    }).toEqual(source);
  });

  it("контейнеры используют исходные задачи, папки включают потомков, архив фильтруется отдельно", () => {
    const state = scenario();
    task(state, "TM-106").archived = true;
    const nested = getLocationTasks(state, {
      kind: "folder",
      id: "f-interface",
    });
    expect(nested.map((item) => item.id)).toEqual(["TM-102"]);
    expect(nested[0]).toBe(task(state, "TM-102"));
    expect(
      getLocationTasks(state, { kind: "folder", id: "f-interface" }, true).map(
        (item) => item.id,
      ),
    ).toEqual(["TM-106"]);
    expect(
      getLocationTasks(state, { kind: "project", id: "p-content" }).every(
        (item) => item.projectId === "p-content",
      ),
    ).toBe(true);
    expect(
      getLocationTasks(state, { kind: "workspace", id: "w-personal" }),
    ).toEqual([]);
    expect(getLocationTasks(state, { kind: "folder", id: "missing" })).toEqual(
      [],
    );
  });

  it("разорванные связи и циклы папок не образуют частичный путь или видимость задач", () => {
    const state = scenario();
    state.folders.find((folder) => folder.id === "f-interface")!.parentId =
      "f-references";
    expect(
      getLocationPath(state, { kind: "list", id: "l-references" }),
    ).toEqual([]);
    expect(
      getLocationTasks(state, { kind: "folder", id: "f-interface" }),
    ).toEqual([]);
    expect(
      create(state, {
        kind: "folder",
        projectId: "p-realize",
        parentId: "f-interface",
      }).lastResult.ok,
    ).toBe(false);
    expect(
      create(state, {
        kind: "list",
        projectId: "p-realize",
        folderId: "f-references",
      }).lastResult.ok,
    ).toBe(false);
    state.projects.find((project) => project.id === "p-store")!.workspaceId =
      "missing";
    expect(getLocationPath(state, { kind: "project", id: "p-store" })).toEqual(
      [],
    );
    const orphan = scenario();
    orphan.folders.find((folder) => folder.id === "f-interface")!.parentId =
      "missing";
    expect(
      getLocationPath(orphan, { kind: "list", id: "l-references" }),
    ).toEqual([]);
  });

  it("задача требует существующий List своего Project без частичной записи", () => {
    const source = scenario();
    for (const listId of ["", "missing", "l-p-store"]) {
      const rejected = prototypeReducer(source, {
        type: "task/create",
        draft: {
          ...createTaskDraft("p-realize", undefined, listId),
          title: "Неверный список",
        },
      });
      expect(rejected.lastResult.ok).toBe(false);
      expect(rejected.lastResult.fieldErrors?.listId).toBeDefined();
      expect(rejected.tasks).toEqual(source.tasks);
    }
  });

  it("ребёнок наследует список родителя, отдельный перенос родителя или ребёнка отклоняется", () => {
    const source = scenario();
    let state = prototypeReducer(source, {
      type: "task/create",
      draft: {
        ...createTaskDraft("p-realize", "TM-102", "l-references"),
        title: "Вложенная работа",
      },
    });
    expect(state.lastResult.ok).toBe(true);
    const childId = state.lastResult.taskId!;
    state = prototypeReducer(state, {
      type: "task/create",
      draft: {
        ...createTaskDraft("p-realize", childId, "l-references"),
        title: "Второй уровень",
      },
    });
    expect(state.lastResult.ok).toBe(true);
    const parentMove = prototypeReducer(state, {
      type: "task/save",
      taskId: "TM-102",
      draft: { ...taskToDraft(task(state, "TM-102")), listId: "l-interface" },
    });
    expect(parentMove.lastResult.fieldErrors?.listId).toBeDefined();
    expect(parentMove.tasks).toEqual(state.tasks);
    const childMove = prototypeReducer(state, {
      type: "task/save",
      taskId: childId,
      draft: { ...taskToDraft(task(state, childId)), listId: "l-interface" },
    });
    expect(childMove.lastResult.fieldErrors?.parentId).toBeDefined();
    expect(childMove.tasks).toEqual(state.tasks);
    const wrongNewChild = prototypeReducer(source, {
      type: "task/create",
      draft: {
        ...createTaskDraft("p-realize", "TM-102"),
        title: "Чужой список",
      },
    });
    expect(wrongNewChild.lastResult.fieldErrors?.parentId).toBeDefined();
  });

  it("смена List активного исполнения запрещена, дубликат сохраняет контейнер без старой parent-связи", () => {
    const source = scenario();
    task(source, "TM-102").run = { state: "running", attempt: 1 };
    const rejected = prototypeReducer(source, {
      type: "task/save",
      taskId: "TM-102",
      draft: { ...taskToDraft(task(source, "TM-102")), listId: "l-interface" },
    });
    expect(rejected.lastResult.fieldErrors?.execution).toBeDefined();
    expect(rejected.tasks).toEqual(source.tasks);
    const duplicated = prototypeReducer(scenario(), {
      type: "task/duplicate",
      taskId: "TM-102",
    });
    expect(duplicated.lastResult.ok).toBe(true);
    expect(duplicated.tasks.at(-1)).toMatchObject({
      projectId: "p-realize",
      listId: "l-references",
      parentId: null,
    });
  });
});
