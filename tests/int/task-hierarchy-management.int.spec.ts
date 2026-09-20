/**
 * @file tests/int/task-hierarchy-management.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Проверяет целостность и права настроек и удаления веток контейнеров reference.
 * @see documentation/specifications/task-management.md
 */
import { describe, expect, it } from "vitest";
import { initialPrototypeState } from "../../src/components/admin/task-manager/reference/taskManager.fixtures";
import { prototypeReducer } from "../../src/components/admin/task-manager/reference/taskManager.reducer";
import { createTaskDraft } from "../../src/components/admin/task-manager/reference/taskManager.draft";
import { getHierarchyDeletion } from "../../src/components/admin/task-manager/reference/taskHierarchyManagement.selectors";
import type { ManagedTaskLocation } from "../../src/components/admin/task-manager/reference/taskHierarchyManagement.types";
import type {
  PrototypeAction,
  PrototypeState,
  RunState,
} from "../../src/components/admin/task-manager/reference/taskManager.types";

function fixture() {
  let state = structuredClone(initialPrototypeState);
  const run = (action: PrototypeAction) => {
    state = prototypeReducer(state, action);
    expect(state.lastResult.ok, state.lastResult.message).toBe(true);
    return state.lastResult;
  };
  const project = run({
    type: "hierarchy/create",
    location: { kind: "project", workspaceId: "w-realize" },
    name: "Удаляемый проект",
    description: "Описание",
  }).location as ManagedTaskLocation;
  const folder = run({
    type: "hierarchy/create",
    location: { kind: "folder", projectId: project.id, parentId: null },
    name: "Папка",
    description: "",
  }).location as ManagedTaskLocation;
  const nested = run({
    type: "hierarchy/create",
    location: { kind: "folder", projectId: project.id, parentId: folder.id },
    name: "Вложенная",
    description: "",
  }).location as ManagedTaskLocation;
  const list = run({
    type: "hierarchy/create",
    location: { kind: "list", projectId: project.id, folderId: nested.id },
    name: "Список",
    description: "",
  }).location as ManagedTaskLocation;
  const draft = createTaskDraft(project.id);
  draft.listId = list.id;
  draft.title = "Локальная задача";
  const taskId = run({ type: "task/create", draft }).taskId!;
  return { state, project, folder, nested, list, taskId };
}

describe("Настройки и удаление контейнеров", () => {
  it("сохраняет название/описание папки без изменения её ID, задач или родителя", () => {
    const { state, folder } = fixture();
    const next = prototypeReducer(state, {
      type: "hierarchy/save",
      location: folder,
      name: " Новая папка ",
      description: " Контекст ",
    });
    expect(next.lastResult.ok).toBe(true);
    expect(next.folders.find(({ id }) => id === folder.id)).toMatchObject({
      id: folder.id,
      name: "Новая папка",
      description: "Контекст",
    });
    expect(next.tasks).toEqual(state.tasks);
    expect(state.folders.find(({ id }) => id === folder.id)?.name).toBe(
      "Папка",
    );
  });
  it("не сохраняет дубликат названия проекта и некорректный черновик", () => {
    const { state, project } = fixture();
    for (const name of ["", "Магазин", "X".repeat(101)]) {
      const next = prototypeReducer(state, {
        type: "hierarchy/save",
        location: project,
        name,
        description: "",
      });
      expect(next.lastResult.ok).toBe(false);
      expect(next.projects).toBe(state.projects);
    }
  });
  it.each(["project", "folder", "list"] as const)(
    "удаляет %s и содержимое ветки, сохраняя соседей и диалоги",
    (kind) => {
      const data = fixture();
      const { state, taskId } = data;
      const target = data[kind];
      state.tasks.find(({ id }) => id === taskId)!.archived = true;
      const next = prototypeReducer(state, {
        type: "hierarchy/delete",
        location: target,
      });
      expect(next.lastResult.ok).toBe(true);
      expect(next.tasks.map(({ id }) => id)).toEqual(
        initialPrototypeState.tasks.map(({ id }) => id),
      );
      expect(next.conversations).toEqual(state.conversations);
      expect(next.lastResult.removedLocations).toContainEqual(target);
      expect(next.lastResult.location?.kind).toBe(
        kind === "project"
          ? "workspace"
          : kind === "folder"
            ? "project"
            : "folder",
      );
      expect(state.tasks.some(({ id }) => id === taskId)).toBe(true);
    },
  );
  it.each(["queued", "blocked", "running", "paused"] as RunState[])(
    "отклоняет удаление с исполнением %s без частичной записи",
    (runState) => {
      const { state, project, taskId } = fixture();
      state.tasks.find(({ id }) => id === taskId)!.run.state = runState;
      const next = prototypeReducer(state, {
        type: "hierarchy/delete",
        location: project,
      });
      expect(next.lastResult.ok).toBe(false);
      expect(next.projects).toBe(state.projects);
      expect(next.tasks).toBe(state.tasks);
    },
  );
  it("сохраняет ветку при незавершённом делегировании", () => {
    const { state, folder, taskId } = fixture();
    state.tasks.find(({ id }) => id === taskId)!.handoff = {
      state: "pending",
      toActorId: "agent",
      kind: "transfer",
      scope: "Проверка",
    };
    expect(
      prototypeReducer(state, { type: "hierarchy/delete", location: folder })
        .lastResult.ok,
    ).toBe(false);
  });
  it.each(["dependsOn", "related"] as const)(
    "блокирует входящие %s из других контейнеров",
    (field) => {
      const { state, project, taskId } = fixture();
      state.tasks[0][field].push(taskId);
      const next = prototypeReducer(state, {
        type: "hierarchy/delete",
        location: project,
      });
      expect(next.lastResult.ok).toBe(false);
      expect(next.tasks).toBe(state.tasks);
      expect(getHierarchyDeletion(state, project).reason).toContain(
        "связанные",
      );
    },
  );
  it.each(["save", "delete"] as const)(
    "проверяет ACL и архив среды для hierarchy/%s",
    (type) => {
      const { state, project } = fixture();
      const action: PrototypeAction =
        type === "save"
          ? {
              type: "hierarchy/save",
              location: project,
              name: "Изменено",
              description: "",
            }
          : { type: "hierarchy/delete", location: project };
      const reader: PrototypeState = { ...state, currentActorId: "unknown" };
      expect(prototypeReducer(reader, action).lastResult.ok).toBe(false);
      state.workspaces.find(({ id }) => id === "w-realize")!.archived = true;
      expect(prototypeReducer(state, action).lastResult.ok).toBe(false);
    },
  );
  it("не переиспользует ID удалённого контейнера в новых персональных ссылках", () => {
    const { state, project } = fixture();
    const deleted = prototypeReducer(state, {
      type: "hierarchy/delete",
      location: project,
    });
    const next = prototypeReducer(deleted, {
      type: "hierarchy/create",
      location: { kind: "project", workspaceId: "w-realize" },
      name: "Другой проект",
      description: "",
    });
    expect(next.lastResult.ok).toBe(true);
    expect(next.lastResult.location?.id).not.toBe(project.id);
  });
});
