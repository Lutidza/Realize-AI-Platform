/**
 * @file src/components/admin/task-manager/reference/taskWorkbenchToolbar.selectors.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Вычисляет доступные поисковые записи и поводы для уведомлений из единого demo store.
 * @see documentation/architecture/system-admin-shell.md
 */
import { getLocationPath } from "./taskManager.hierarchy";
import type { SystemAdminLocale } from "@realize/ui-kit";
import { taskWorkbenchMessages } from "./taskWorkbench.messages";
import {
  getLocationWorkspace,
  getWorkspaceAccess,
} from "./taskWorkspace.access";
import type { PrototypeState, TaskLocation } from "./taskManager.types";
import type {
  TaskToolbarNotificationRecord,
  TaskToolbarSearchRecord,
} from "./TaskWorkbenchToolbar.types";

function isAvailable(state: PrototypeState, location: TaskLocation) {
  const workspace = getLocationWorkspace(state, location);
  return Boolean(
    workspace &&
    !workspace.archived &&
    getWorkspaceAccess(state, workspace).canRead,
  );
}

/** Только доступные активные объекты; поисковая проекция не расширяет ACL исходного store. */
export function getToolbarSearchRecords(
  state: PrototypeState,
  locale: SystemAdminLocale = "ru",
): TaskToolbarSearchRecord[] {
  const t = taskWorkbenchMessages[locale];
  const groups = t.groups;
  const collections = {
    workspace: state.workspaces,
    project: state.projects,
    folder: state.folders,
    list: state.lists,
  };
  const records: TaskToolbarSearchRecord[] = [];
  for (const kind of Object.keys(collections) as TaskLocation["kind"][]) {
    for (const entry of collections[kind]) {
      const location = { kind, id: entry.id };
      if (!isAvailable(state, location)) continue;
      records.push({
        id: `${kind}:${entry.id}`,
        label: entry.name,
        group: groups[kind],
        location,
        description:
          getLocationPath(state, location)
            .slice(0, -1)
            .map((part) => part.name)
            .join(" / ") || t.kinds.workspace,
      });
    }
  }
  for (const task of state.tasks) {
    const location: TaskLocation = { kind: "list", id: task.listId };
    if (
      task.archived ||
      state.lists.find((list) => list.id === task.listId)?.projectId !==
        task.projectId ||
      !isAvailable(state, location)
    )
      continue;
    records.push({
      id: `task:${task.id}`,
      label: task.title,
      group: t.groups.task,
      location,
      taskId: task.id,
      keywords: `${task.id} ${task.tags.join(" ")}`,
      description: `${task.id} · ${getLocationPath(state, location)
        .slice(-2)
        .map((part) => part.name)
        .join(" / ")}`,
    });
  }
  return records;
}

/** Уведомления reference отражают текущее требуемое внимание, а не выдуманную историю inbox. */
export function getToolbarNotifications(
  state: PrototypeState,
  workspaceId: string,
  locale: SystemAdminLocale = "ru",
): TaskToolbarNotificationRecord[] {
  return state.tasks.flatMap((task) => {
    const location: TaskLocation = { kind: "list", id: task.listId };
    if (
      task.archived ||
      state.lists.find((list) => list.id === task.listId)?.projectId !==
        task.projectId ||
      !isAvailable(state, location) ||
      getLocationWorkspace(state, location)?.id !== workspaceId
    )
      return [];
    const reason =
      task.run.state === "failed"
        ? "failed"
        : task.run.state === "blocked"
          ? "blocked"
          : task.handoff?.state === "pending"
            ? "handoff"
            : task.status === "review"
              ? "review"
              : null;
    if (!reason) return [];
    return [
      {
        id: `${state.currentActorId}:${task.id}:${reason}:${task.run.attempt}:${task.activity.at(-1)?.id ?? "initial"}`,
        label: task.title,
        description: `${task.id} · ${taskWorkbenchMessages[locale].notifications[reason]}`,
        taskId: task.id,
      },
    ];
  });
}
