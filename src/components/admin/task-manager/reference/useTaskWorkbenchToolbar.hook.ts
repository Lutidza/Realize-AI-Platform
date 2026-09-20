/**
 * @file src/components/admin/task-manager/reference/useTaskWorkbenchToolbar.hook.ts
 * @version 1.2.0
 * @date 2026-09-19
 * @description Связывает общие действия topbar с guard, формами и локальным состоянием чтения уведомлений.
 * @see documentation/architecture/system-admin-shell.md
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { prototypeActors } from "./taskManager.fixtures";
import {
  getToolbarNotifications,
  getToolbarSearchRecords,
} from "./taskWorkbenchToolbar.selectors";
import type { TaskCreationKind } from "./TaskCreation.types";
import type { HierarchyCreation } from "./taskManager.types";
import type { TaskWorkbenchToolbarProps } from "./TaskWorkbenchToolbar.types";

export function useTaskWorkbenchToolbar({
  state,
  ui,
  manager,
  locale,
}: TaskWorkbenchToolbarProps) {
  const router = useRouter();
  const [creationKind, setCreationKind] = useState<TaskCreationKind | null>(
    null,
  );
  const [accountView, setAccountView] = useState<"balance" | "topup" | null>(
    null,
  );
  const openCreation = (kind: TaskCreationKind = "task") =>
    manager.requestNavigation(() => setCreationKind(kind));
  const openAccount = (path: string) =>
    manager.requestNavigation(() => router.push(path));
  const [readIds, setReadIds] = useState<string[]>([]);
  const workspace = state.workspaces.find((item) => item.id === ui.workspaceId);
  const actor = prototypeActors.find(
    (item) => item.id === state.currentActorId,
  );
  const openTask = (id: string) => manager.openTasks(() => ui.onOpenTask(id));
  const create = (creation: HierarchyCreation) =>
    manager.requestNavigation(() => ui.setHierarchyCreation(creation));
  const records = getToolbarNotifications(state, ui.workspaceId, locale);
  return {
    workspace,
    actor,
    creationKind,
    setCreationKind,
    openCreation,
    accountView,
    setAccountView,
    openAccount,
    openBilling: (view: "balance" | "topup") =>
      manager.requestNavigation(() => setAccountView(view)),
    create,
    selectWorkspace: (id: string) =>
      manager.openTasks(() => ui.navigateLocation({ kind: "workspace", id })),
    openSettings: () => {
      if (workspace) manager.openSettings(workspace.id);
    },
    openAssistant: () =>
      manager.requestNavigation(() => router.push("/admin/ai")),
    searchEntries: getToolbarSearchRecords(state, locale).map((record) => ({
      ...record,
      onSelect: () =>
        record.taskId
          ? openTask(record.taskId)
          : manager.openTasks(() => ui.navigateLocation(record.location)),
    })),
    notifications: records.map((record) => ({
      ...record,
      unread: !readIds.includes(record.id),
      onSelect: () => {
        setReadIds((current) =>
          current.includes(record.id) ? current : [...current, record.id],
        );
        openTask(record.taskId);
      },
    })),
    readAll: () =>
      setReadIds((current) => [
        ...new Set([...current, ...records.map((record) => record.id)]),
      ]),
  };
}
