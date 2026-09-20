/**
 * @file src/components/admin/task-manager/reference/taskCreation.selectors.ts
 * @version 1.0.0
 * @date 2026-09-19
 * @description Выбирает разрешённую иерархию и начальное расположение для создания из любого уровня.
 * @see documentation/specifications/task-management.md
 */
import { getLocationPath } from "./taskManager.hierarchy";
import { getWorkspaceAccess } from "./taskWorkspace.access";
import type { PrototypeState, TaskLocation } from "./taskManager.types";
import type { TaskCreationContext } from "./TaskCreation.types";

/** Иерархия для формы не раскрывает закрытые/архивные среды и повреждённые цепочки. */
export function getTaskCreationContext(
  state: PrototypeState,
  location: TaskLocation,
): TaskCreationContext {
  const workspaces = state.workspaces.filter(
    (item) => getWorkspaceAccess(state, item).canWrite,
  );
  const workspaceIds = new Set(workspaces.map((item) => item.id));
  const allowed = (entry: TaskLocation) => {
    const path = getLocationPath(state, entry);
    return Boolean(path.length && workspaceIds.has(path[0].id));
  };
  const hierarchy = {
    workspaces,
    projects: state.projects.filter((item) =>
      allowed({ kind: "project", id: item.id }),
    ),
    folders: state.folders.filter((item) =>
      allowed({ kind: "folder", id: item.id }),
    ),
    lists: state.lists.filter((item) => allowed({ kind: "list", id: item.id })),
  };
  const path = allowed(location) ? getLocationPath(state, location) : [];
  const workspaceId = path[0]?.id ?? workspaces[0]?.id ?? "";
  const projectId =
    path.find((item) => item.kind === "project")?.id ??
    hierarchy.projects.find((item) => item.workspaceId === workspaceId)?.id ??
    "";
  const folderId = path.findLast((item) => item.kind === "folder")?.id ?? null;
  const listId =
    path.find((item) => item.kind === "list")?.id ??
    hierarchy.lists.find(
      (item) =>
        item.projectId === projectId &&
        (!folderId ||
          getLocationPath(hierarchy, { kind: "list", id: item.id }).some(
            (part) => part.kind === "folder" && part.id === folderId,
          )),
    )?.id ??
    null;
  return { hierarchy, workspaceId, projectId, folderId, listId };
}
