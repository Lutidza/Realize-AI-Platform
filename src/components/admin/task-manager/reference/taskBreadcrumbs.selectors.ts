/**
 * @file src/components/admin/task-manager/reference/taskBreadcrumbs.selectors.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Выбирает доступных соседей текущего контейнера в пределах одного родителя.
 * @see documentation/specifications/task-management.md
 */
import { getLocationPath } from "./taskManager.hierarchy";
import {
  getLocationWorkspace,
  getWorkspaceAccess,
} from "./taskWorkspace.access";
import type { PrototypeState, TaskLocation } from "./taskManager.types";

/** Совпадение глубины недостаточно: тип и конкретный parent должны совпадать. */
export function getTaskLocationSiblings(
  state: PrototypeState,
  location: TaskLocation,
) {
  const path = getLocationPath(state, location);
  if (!path.length) return [];
  const parent = path.at(-2);
  const records = {
    workspace: state.workspaces,
    project: state.projects,
    folder: state.folders,
    list: state.lists,
  }[location.kind];
  return records.flatMap((record) => {
    const candidate = { kind: location.kind, id: record.id };
    const workspace = getLocationWorkspace(state, candidate);
    if (
      !workspace ||
      workspace.archived ||
      !getWorkspaceAccess(state, workspace).canRead
    )
      return [];
    const candidatePath = getLocationPath(state, candidate);
    const otherParent = candidatePath.at(-2);
    if (
      !candidatePath.length ||
      otherParent?.kind !== parent?.kind ||
      otherParent?.id !== parent?.id
    )
      return [];
    return [{ ...candidate, name: record.name }];
  });
}
