/**
 * @file src/components/admin/task-manager/reference/taskManager.hierarchy.commands.ts
 * @version 2.2.0
 * @date 2026-09-18
 * @description Создаёт контейнеры референса с проверкой родителей и обязательных начальных записей.
 * @see documentation/specifications/task-management-execution.md
 */

import { applyWorkspaceCommand } from "./taskWorkspace.commands";
import { workspaceDefaults } from "./taskWorkspace.constants";
import { getLocationPath } from "./taskManager.hierarchy";
import type {
  CommandResult,
  PrototypeAction,
  PrototypeState,
  TaskLocation,
} from "./taskManager.types";

function nextId(records: { id: string }[], prefix: string): string {
  // Персональные preferences живут дольше demo-сеанса: старый ID не получает новый контейнер.
  let id = `${prefix}-demo-${crypto.randomUUID()}`;
  while (records.some((record) => record.id === id))
    id = `${prefix}-demo-${crypto.randomUUID()}`;
  return id;
}

/** Работает с копией reducer: отказ не публикует контейнер или автоматически созданные дочерние записи. */
export function createHierarchyLocation(
  state: PrototypeState,
  action: Extract<PrototypeAction, { type: "hierarchy/create" }>,
): CommandResult {
  const name = action.name.trim();
  const description = action.description.trim();
  const target = action.location;
  const failed = (message: string): CommandResult => ({ ok: false, message });
  if (!name || name.length > 100)
    return failed("Укажите название длиной от 1 до 100 символов.");
  const validLocation = (location: TaskLocation) =>
    getLocationPath(state, location).length > 0;
  const duplicate = (records: { name: string }[]) =>
    records.some(
      (record) =>
        record.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"),
    );
  const duplicateResult = () =>
    failed("В этом разделе уже есть объект с таким названием.");
  let location: TaskLocation;
  switch (target.kind) {
    case "workspace":
      return applyWorkspaceCommand(state, {
        type: "workspace/create",
        draft: { ...workspaceDefaults, name, description },
      });
    case "project": {
      if (!validLocation({ kind: "workspace", id: target.workspaceId }))
        return failed("Выберите существующую рабочую среду.");
      if (
        duplicate(
          state.projects.filter(
            (project) => project.workspaceId === target.workspaceId,
          ),
        )
      )
        return duplicateResult();
      const occupied = [
        ...state.projects,
        ...state.lists.map((list) => ({ id: list.id.replace(/^l-/, "") })),
      ];
      const id = nextId(occupied, "p");
      state.projects.push({
        id,
        workspaceId: target.workspaceId,
        name,
        description,
        initials: name.slice(0, 2).toLocaleUpperCase("ru"),
      });
      state.lists.push({
        id: `l-${id}`,
        projectId: id,
        folderId: null,
        name: "Задачи",
        description: "Основной список задач проекта",
      });
      location = { kind: "project", id };
      break;
    }
    case "folder": {
      if (!validLocation({ kind: "project", id: target.projectId }))
        return failed("Выберите существующий проект.");
      if (
        target.parentId !== null &&
        (!state.folders.some(
          (folder) =>
            folder.id === target.parentId &&
            folder.projectId === target.projectId,
        ) ||
          !validLocation({ kind: "folder", id: target.parentId }))
      )
        return failed(
          "Родительская папка должна принадлежать тому же проекту.",
        );
      if (
        duplicate(
          state.folders.filter(
            (folder) =>
              folder.projectId === target.projectId &&
              folder.parentId === target.parentId,
          ),
        )
      )
        return duplicateResult();
      const id = nextId(state.folders, "f");
      state.folders.push({
        id,
        projectId: target.projectId,
        parentId: target.parentId,
        name,
        description,
      });
      location = { kind: "folder", id };
      break;
    }
    case "list": {
      if (!validLocation({ kind: "project", id: target.projectId }))
        return failed("Выберите существующий проект.");
      if (
        target.folderId !== null &&
        (!state.folders.some(
          (folder) =>
            folder.id === target.folderId &&
            folder.projectId === target.projectId,
        ) ||
          !validLocation({ kind: "folder", id: target.folderId }))
      )
        return failed("Папка списка должна принадлежать тому же проекту.");
      if (
        duplicate(
          state.lists.filter(
            (list) =>
              list.projectId === target.projectId &&
              list.folderId === target.folderId,
          ),
        )
      )
        return duplicateResult();
      const id = nextId(state.lists, "l");
      state.lists.push({
        id,
        projectId: target.projectId,
        folderId: target.folderId,
        name,
        description,
      });
      location = { kind: "list", id };
      break;
    }
  }
  return { ok: true, message: `Создано: «${name}».`, location };
}
