/**
 * @file tests/int/task-creation-context.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-19
 * @description Проверяет выбор расположения и границы доступа единой формы создания.
 * @see documentation/specifications/task-management.md
 */
import { describe, expect, it } from "vitest";
import { initialPrototypeState } from "../../src/components/admin/task-manager/reference/taskManager.fixtures";
import { getTaskCreationContext } from "../../src/components/admin/task-manager/reference/taskCreation.selectors";
import { prototypeReducer } from "../../src/components/admin/task-manager/reference/taskManager.reducer";

describe("Расположение единого создания", () => {
  it("выбирает проект из корня среды и сохраняет вложенный контекст списка", () => {
    const root = getTaskCreationContext(initialPrototypeState, {
      kind: "workspace",
      id: "w-realize",
    });
    expect(root.workspaceId).toBe("w-realize");
    expect(
      root.hierarchy.projects.find((item) => item.id === root.projectId)
        ?.workspaceId,
    ).toBe("w-realize");
    const list = getTaskCreationContext(initialPrototypeState, {
      kind: "list",
      id: "l-references",
    });
    expect(list).toMatchObject({
      projectId: "p-realize",
      folderId: "f-references",
      listId: "l-references",
    });
  });
  it("не предлагает read-only, private и archived среды или повреждённые цепочки", () => {
    for (const mode of ["private", "reader", "archived"] as const) {
      const state = structuredClone(initialPrototypeState);
      const workspace = state.workspaces.find(
        (item) => item.id === "w-realize",
      )!;
      workspace.ownerId = "anna";
      workspace.members =
        mode === "reader"
          ? [{ actorId: state.currentActorId, role: "guest" }]
          : [];
      workspace.visibility = mode === "private" ? "private" : "internal";
      workspace.archived = mode === "archived";
      const result = getTaskCreationContext(state, {
        kind: "project",
        id: "p-realize",
      });
      expect(
        result.hierarchy.workspaces.some((item) => item.id === "w-realize"),
      ).toBe(false);
      expect(
        result.hierarchy.projects.some((item) => item.id === "p-realize"),
      ).toBe(false);
      expect(
        result.hierarchy.folders.some((item) => item.projectId === "p-realize"),
      ).toBe(false);
      expect(
        result.hierarchy.lists.some((item) => item.projectId === "p-realize"),
      ).toBe(false);
    }
    const state = structuredClone(initialPrototypeState);
    state.lists.push({
      id: "broken",
      projectId: "p-store",
      folderId: "f-references",
      name: "Broken",
      description: "",
    });
    expect(
      getTaskCreationContext(state, {
        kind: "list",
        id: "broken",
      }).hierarchy.lists.some((item) => item.id === "broken"),
    ).toBe(false);
  });
  it("при пустой иерархии оставляет явный пустой выбор без несуществующего родителя", () => {
    const state = {
      ...initialPrototypeState,
      workspaces: [],
      projects: [],
      folders: [],
      lists: [],
    };
    expect(
      getTaskCreationContext(state, { kind: "project", id: "missing" }),
    ).toEqual({
      hierarchy: { workspaces: [], projects: [], folders: [], lists: [] },
      workspaceId: "",
      projectId: "",
      folderId: null,
      listId: null,
    });
  });
  it("reducer повторно запрещает запись, если доступ изменился после выбора", () => {
    const state = structuredClone(initialPrototypeState);
    const context = getTaskCreationContext(state, {
      kind: "workspace",
      id: "w-realize",
    });
    state.workspaces.find((item) => item.id === context.workspaceId)!.archived =
      true;
    const result = prototypeReducer(state, {
      type: "hierarchy/create",
      location: {
        kind: "folder",
        projectId: context.projectId,
        parentId: null,
      },
      name: "Новая папка",
      description: "",
    });
    expect(result.lastResult.ok).toBe(false);
    expect(result.folders).toEqual(state.folders);
  });
});
