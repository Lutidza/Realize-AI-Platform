/**
 * @file src/components/admin/task-manager/reference/taskManager.navigationFavorites.tsx
 * @version 2.1.1
 * @date 2026-10-12
 * @description Формирует актуальный каталог контейнеров и представлений задач для общего избранного оболочки.
 * @see documentation/architecture/system-admin-shell.md
 */

import {
  Archive,
  Building2,
  Folder,
  FolderKanban,
  LayoutDashboard,
  List,
} from "lucide-react";
import type { SystemAdminNavigationLink } from "@realize/template-realize/ui";
import {
  getLocationWorkspace,
  getWorkspaceAccess,
} from "./taskWorkspace.access";
import { getLocationPath } from "./taskManager.hierarchy";
import type { PrototypeState, TaskLocation } from "./taskManager.types";
import type { useTaskWorkbench } from "./useTaskWorkbench.hook";

/** Содержит весь текущий каталог, а не копию выбранного пользователем избранного. */
export function getTaskNavigationFavoriteLinks(
  state: PrototypeState,
  navigateLocation: ReturnType<typeof useTaskWorkbench>["navigateLocation"],
): SystemAdminNavigationLink[] {
  const locations: TaskLocation[] = [
    ...state.workspaces.map(({ id }) => ({ kind: "workspace" as const, id })),
    ...state.projects.map(({ id }) => ({ kind: "project" as const, id })),
    ...state.folders.map(({ id }) => ({ kind: "folder" as const, id })),
    ...state.lists.map(({ id }) => ({ kind: "list" as const, id })),
  ];
  const icons = {
    workspace: Building2,
    project: FolderKanban,
    folder: Folder,
    list: List,
  };
  const containers = locations.flatMap(
    (location): SystemAdminNavigationLink[] => {
      const workspace = getLocationWorkspace(state, location);
      if (
        !workspace ||
        workspace.archived ||
        !getWorkspaceAccess(state, workspace).canRead
      )
        return [];
      const path = getLocationPath(state, location);
      const current = path.at(-1);
      if (!current) return [];
      const Icon = icons[location.kind];
      return [
        {
          id: `task-location-${location.kind}-${location.id}`,
          label: current.name,
          icon: <Icon size={16} strokeWidth={1.75} aria-hidden="true" />,
          description: path.map((entry) => entry.name).join(" / "),
          onSelect: () => navigateLocation(location),
        },
      ];
    },
  );
  return [
    ...containers,
    ...state.workspaces
      .filter(
        (entry) => !entry.archived && getWorkspaceAccess(state, entry).canRead,
      )
      .flatMap((workspace): SystemAdminNavigationLink[] => [
        {
          id: `task-overview-workspace-${workspace.id}`,
          label: `Обзор задач · ${workspace.name}`,
          icon: (
            <LayoutDashboard size={16} strokeWidth={1.75} aria-hidden="true" />
          ),
          description: `${workspace.name} / Обзор задач`,
          onSelect: () =>
            navigateLocation(
              { kind: "workspace", id: workspace.id },
              "overview",
            ),
        },
        {
          id: `task-archive-workspace-${workspace.id}`,
          favoriteable: false,
          label: `Архив · ${workspace.name}`,
          icon: <Archive size={16} strokeWidth={1.75} aria-hidden="true" />,
          description: `${workspace.name} / Архив задач`,
          onSelect: () =>
            navigateLocation(
              { kind: "workspace", id: workspace.id },
              "list",
              true,
            ),
        },
      ]),
  ];
}
