/**
 * @file src/components/admin/task-manager/reference/taskManager.hierarchy.ts
 * @version 2.1.0
 * @date 2026-09-18
 * @description Вычисляет пути контейнеров и принадлежность задач без копирования состояния.
 * @see documentation/specifications/task-management.md
 */

import type {
  PrototypeHierarchy,
  PrototypeState,
  PrototypeTask,
  TaskLocation,
} from "./taskManager.types";

export function getLocationInfo(
  state: PrototypeHierarchy,
  location: TaskLocation,
): { name: string; description: string; avatar?: string } | undefined {
  const records = {
    workspace: state.workspaces,
    project: state.projects,
    folder: state.folders,
    list: state.lists,
  };
  const record = records[location.kind].find((item) => item.id === location.id);
  return record
    ? {
        name: record.name,
        description: "description" in record ? (record.description ?? "") : "",
        avatar: "avatar" in record ? record.avatar : undefined,
      }
    : undefined;
}

/** undefined означает разорванную связь; null — достигнутый корень Workspace. */
function parentLocation(
  state: PrototypeHierarchy,
  location: TaskLocation,
): TaskLocation | null | undefined {
  switch (location.kind) {
    case "workspace":
      return null;
    case "project": {
      const project = state.projects.find((item) => item.id === location.id);
      return project
        ? { kind: "workspace", id: project.workspaceId }
        : undefined;
    }
    case "folder": {
      const folder = state.folders.find((item) => item.id === location.id);
      if (!folder) return undefined;
      if (folder.parentId === null)
        return { kind: "project", id: folder.projectId };
      const parent = state.folders.find((item) => item.id === folder.parentId);
      return parent?.projectId === folder.projectId
        ? { kind: "folder", id: parent.id }
        : undefined;
    }
    case "list": {
      const list = state.lists.find((item) => item.id === location.id);
      if (!list) return undefined;
      if (list.folderId === null)
        return { kind: "project", id: list.projectId };
      const folder = state.folders.find((item) => item.id === list.folderId);
      return folder?.projectId === list.projectId
        ? { kind: "folder", id: folder.id }
        : undefined;
    }
  }
}

/** Повреждённая или цикличная ветка возвращает пустой путь, не частичную принадлежность. */
export function getLocationPath(
  state: PrototypeHierarchy,
  location: TaskLocation,
): (TaskLocation & { name: string })[] {
  const path: (TaskLocation & { name: string })[] = [];
  const visited = new Set<string>();
  let cursor: TaskLocation | null | undefined = location;
  while (cursor) {
    const key = `${cursor.kind}:${cursor.id}`;
    const record = getLocationInfo(state, cursor);
    if (!record || visited.has(key)) return [];
    visited.add(key);
    path.unshift({ ...cursor, name: record.name });
    cursor = parentLocation(state, cursor);
  }
  return cursor === undefined ? [] : path;
}

/** Folder включает списки вложенных папок; фильтр архива применяется к исходным задачам. */
export function getLocationTasks(
  state: PrototypeState,
  location: TaskLocation,
  archived = false,
): PrototypeTask[] {
  const listIds = new Set(
    state.lists
      .filter((list) =>
        getLocationPath(state, { kind: "list", id: list.id }).some(
          (ancestor) =>
            ancestor.kind === location.kind && ancestor.id === location.id,
        ),
      )
      .map((list) => list.id),
  );
  return state.tasks.filter(
    (task) =>
      task.archived === archived &&
      listIds.has(task.listId) &&
      state.lists.some(
        (list) => list.id === task.listId && list.projectId === task.projectId,
      ),
  );
}

/** Задача открывается в основном List; представления и дерево не создают её копий. */
export function getTaskLocation(
  _state: PrototypeState,
  task: PrototypeTask,
): TaskLocation {
  return { kind: "list", id: task.listId };
}
