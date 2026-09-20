/**
 * @file src/components/admin/task-manager/reference/taskWorkspace.access.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Вычисляет права демо-пользователя и принадлежность команд рабочим средам.
 * @see documentation/specifications/task-management-execution.md
 */

import { getLocationPath } from "./taskManager.hierarchy";
import { prototypeActors } from "./taskManager.fixtures";
import type {
  PrototypeAction,
  PrototypeState,
  TaskLocation,
} from "./taskManager.types";
import type { PrototypeWorkspace, WorkspaceDraft } from "./taskWorkspace.types";

/** Это локальная модель демонстрации; реальный ACL должен проверяться сервером хоста. */
export function getWorkspaceAccess(
  state: Pick<PrototypeState, "currentActorId">,
  workspace?: PrototypeWorkspace,
) {
  const owner = Boolean(
    workspace && workspace.ownerId === state.currentActorId,
  );
  const role = workspace?.members.find(
    (member) => member.actorId === state.currentActorId,
  )?.role;
  const canManage = owner || role === "admin";
  const canRead = Boolean(
    workspace &&
    (owner ||
      role ||
      (workspace.visibility === "internal" &&
        prototypeActors.some((actor) => actor.id === state.currentActorId))),
  );
  return {
    canRead,
    canManage,
    canWrite: Boolean(
      workspace && !workspace.archived && (canManage || role === "member"),
    ),
    owner,
    role: owner ? "owner" : (role ?? "reader"),
  };
}
export function getLocationWorkspace(
  state: PrototypeState,
  location: TaskLocation,
) {
  const workspaceId = getLocationPath(state, location)[0]?.id;
  return state.workspaces.find((entry) => entry.id === workspaceId);
}
export function getWorkspaceDraft(workspace: WorkspaceDraft): WorkspaceDraft {
  return {
    name: workspace.name,
    description: workspace.description,
    color: workspace.color,
    icon: workspace.icon,
    timezone: workspace.timezone,
    workingDays: [...workspace.workingDays],
    visibility: workspace.visibility,
  };
}
/** Все обычные команды записи проходят один guard, включая bulk и прямой dispatch. */
export function checkWorkspaceWrite(
  state: PrototypeState,
  action: PrototypeAction,
): string | null {
  if (action.type === "reset" || action.type.startsWith("workspace/"))
    return null;
  if (
    action.type === "hierarchy/create" &&
    action.location.kind === "workspace"
  )
    return null;
  const locations: TaskLocation[] = [];
  if (action.type === "hierarchy/save" || action.type === "hierarchy/delete")
    locations.push(action.location);
  if (action.type === "hierarchy/create") {
    const target = action.location;
    if (target.kind === "project")
      locations.push({ kind: "workspace", id: target.workspaceId });
    else if (target.kind === "folder" || target.kind === "list")
      locations.push({ kind: "project", id: target.projectId });
  } else if (action.type === "task/create" || action.type === "task/save") {
    locations.push({ kind: "project", id: action.draft.projectId });
  }
  if ("taskId" in action) {
    const task = state.tasks.find((entry) => entry.id === action.taskId);
    if (task) locations.push({ kind: "project", id: task.projectId });
  }
  if (action.type === "task/bulk") {
    for (const task of state.tasks.filter((entry) =>
      action.taskIds.includes(entry.id),
    ))
      locations.push({ kind: "project", id: task.projectId });
  }
  for (const location of locations) {
    const workspace = getLocationWorkspace(state, location);
    if (!workspace) continue; // Несуществующего родителя объясняет validator конкретной команды.
    if (workspace.archived)
      return "Рабочая среда в архиве. Восстановите её перед изменениями.";
    if (!getWorkspaceAccess(state, workspace).canWrite)
      return "Недостаточно прав для изменения этой рабочей среды.";
  }
  return null;
}

/** Счётчики строятся из общей принадлежности задач, без отдельной копии каталога. */
export function getWorkspaceSummary(
  state: PrototypeState,
  workspace: PrototypeWorkspace,
) {
  const projects = state.projects.filter(
    (entry) => entry.workspaceId === workspace.id,
  );
  const ids = new Set(projects.map((entry) => entry.id));
  const tasks = state.tasks.filter(
    (entry) => ids.has(entry.projectId) && !entry.archived,
  );
  return {
    projects: projects.length,
    tasks: tasks.filter((entry) => entry.status !== "done").length,
    running: tasks.filter((entry) => entry.run.state === "running").length,
    waiting: tasks.filter((entry) =>
      ["queued", "blocked", "paused"].includes(entry.run.state),
    ).length,
    members: workspace.members.length + 1,
  };
}
