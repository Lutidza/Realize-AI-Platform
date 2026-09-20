/**
 * @file src/components/admin/task-manager/reference/taskHierarchyManagement.selectors.ts
 * @version 1.0.1
 * @date 2026-09-18
 * @description Вычисляет ветку удаления, зависимости и стабильные ID персональной навигации.
 * @see documentation/specifications/task-management.md
 */
import { getLocationPath } from "./taskManager.hierarchy";
import type { PrototypeState, TaskLocation } from "./taskManager.types";

export const taskLocationNavigationId = (location: TaskLocation) =>
  `link:task-location-${location.kind}-${location.id}`;

/** Счётчики и команда используют одну выборку, включая архивные задачи и вложенные папки. */
export function getHierarchyDeletion(
  state: PrototypeState,
  location: TaskLocation,
) {
  const path = getLocationPath(state, location);
  const candidates: TaskLocation[] = [
    ...state.projects.map(({ id }) => ({ kind: "project" as const, id })),
    ...state.folders.map(({ id }) => ({ kind: "folder" as const, id })),
    ...state.lists.map(({ id }) => ({ kind: "list" as const, id })),
  ];
  const locations = candidates.filter((candidate) =>
    getLocationPath(state, candidate).some(
      (part) => part.kind === location.kind && part.id === location.id,
    ),
  );
  const listIds = new Set(
    locations.filter((part) => part.kind === "list").map(({ id }) => id),
  );
  const tasks = state.tasks.filter((task) => listIds.has(task.listId));
  const taskIds = new Set(tasks.map(({ id }) => id));
  const active = tasks.some(
    (task) =>
      ["queued", "blocked", "running", "paused"].includes(task.run.state) ||
      task.handoff?.state === "pending",
  );
  const linked = state.tasks.filter(
    (task) =>
      !taskIds.has(task.id) &&
      [
        ...task.dependsOn,
        ...task.related,
        ...(task.parentId ? [task.parentId] : []),
      ].some((id) => taskIds.has(id)),
  );
  const reason = !path.length
    ? "Раздел больше не существует."
    : active
      ? "Сначала завершите активные исполнения и передачи задач."
      : linked.length
        ? "В других разделах есть задачи, связанные с этой веткой. Сначала измените эти связи."
        : "";
  return {
    locations,
    tasks,
    taskIds,
    parent: path.at(-2),
    reason,
    folders: locations.filter((part) => part.kind === "folder").length,
    lists: listIds.size,
  };
}
