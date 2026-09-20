/**
 * @file tests/int/task-breadcrumbs.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Проверяет границы соседей в крошках и атомарное сохранение аватарки контейнера.
 * @see documentation/specifications/task-management.md
 */
import { describe, expect, it } from "vitest";
import { initialPrototypeState } from "../../src/components/admin/task-manager/reference/taskManager.fixtures";
import { getTaskLocationSiblings } from "../../src/components/admin/task-manager/reference/taskBreadcrumbs.selectors";
import { prototypeReducer } from "../../src/components/admin/task-manager/reference/taskManager.reducer";
import type { TaskHierarchyManagementAction } from "../../src/components/admin/task-manager/reference/taskHierarchyManagement.types";

const avatar =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";

describe("Контекстные крошки и идентичность контейнера", () => {
  it("оставляет списки только того же родителя, включая одноимённые записи", () => {
    const state = structuredClone(initialPrototypeState);
    state.lists.push({
      id: "l-sibling",
      projectId: "p-realize",
      folderId: "f-references",
      name: "Одно имя",
      description: "",
    });
    state.lists.push({
      id: "l-other",
      projectId: "p-store",
      folderId: null,
      name: "Одно имя",
      description: "",
    });
    state.lists.push({
      id: "l-broken",
      projectId: "p-store",
      folderId: "f-references",
      name: "Одно имя",
      description: "",
    });
    expect(
      getTaskLocationSiblings(state, { kind: "list", id: "l-references" }).map(
        (item) => item.id,
      ),
    ).toEqual(["l-references", "l-sibling"]);
    expect(
      getTaskLocationSiblings(state, { kind: "list", id: "missing" }),
    ).toEqual([]);
  });
  it("исключает закрытые и архивные среды вместе с их проектами", () => {
    const state = structuredClone(initialPrototypeState);
    const workspace = state.workspaces.find((item) => item.id === "w-realize")!;
    workspace.ownerId = "anna";
    workspace.members = [];
    workspace.visibility = "private";
    expect(
      getTaskLocationSiblings(state, { kind: "project", id: "p-realize" }),
    ).toEqual([]);
    expect(
      getTaskLocationSiblings(state, {
        kind: "workspace",
        id: "w-personal",
      }).some((item) => item.id === "w-realize"),
    ).toBe(false);
    workspace.ownerId = state.currentActorId;
    workspace.archived = true;
    expect(
      getTaskLocationSiblings(state, { kind: "project", id: "p-realize" }),
    ).toEqual([]);
  });
  it("сохраняет картинку, совместимость старой команды и явное удаление", () => {
    const state = structuredClone(initialPrototypeState);
    const project = state.projects[0];
    const save: TaskHierarchyManagementAction = {
      type: "hierarchy/save",
      location: { kind: "project", id: project.id },
      name: project.name,
      description: project.description,
    };
    const added = prototypeReducer(state, { ...save, avatar });
    expect(added.lastResult.ok).toBe(true);
    expect(added.projects[0].avatar).toBe(avatar);
    expect(state.projects[0].avatar).toBeUndefined();
    const kept = prototypeReducer(added, save);
    expect(kept.projects[0].avatar).toBe(avatar);
    expect(
      prototypeReducer(kept, { ...save, avatar: null }).projects[0].avatar,
    ).toBeUndefined();
  });
  it("не меняет запись при недопустимой картинке или отсутствии прав", () => {
    const state = structuredClone(initialPrototypeState);
    const project = state.projects[0];
    const save: TaskHierarchyManagementAction = {
      type: "hierarchy/save",
      location: { kind: "project", id: project.id },
      name: "Не должно сохраниться",
      description: "",
      avatar: "https://example.test/avatar.svg",
    };
    const invalid = prototypeReducer(state, save);
    expect(invalid.lastResult.ok).toBe(false);
    expect(invalid.projects).toEqual(state.projects);
    const workspace = state.workspaces.find(
      (item) => item.id === project.workspaceId,
    )!;
    workspace.ownerId = "anna";
    workspace.members = [];
    workspace.visibility = "private";
    const denied = prototypeReducer(state, { ...save, avatar });
    expect(denied.lastResult.ok).toBe(false);
    expect(denied.projects).toEqual(state.projects);
  });
});
