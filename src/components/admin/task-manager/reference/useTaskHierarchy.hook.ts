/**
 * @file src/components/admin/task-manager/reference/useTaskHierarchy.hook.ts
 * @version 2.3.0
 * @date 2026-09-18
 * @description Управляет одноуровневым просмотром проектов и контейнеров выбранного рабочей среды.
 * @see documentation/specifications/task-management-execution.md
 */

import { useEffect, useRef, useState } from "react";
import { getWorkspaceAccess } from "./taskWorkspace.access";
import { getLocationPath, getLocationTasks } from "./taskManager.hierarchy";
import { taskLocationNavigationId } from "./taskHierarchyManagement.selectors";
import { getTaskLocationAppearance } from "./taskLocationAppearance";
import type { TaskLocation } from "./taskManager.types";
import type {
  TaskHierarchyCreationOption,
  TaskHierarchyEntry,
  TaskProjectSidebarProps,
} from "./TaskHierarchy.types";

/** Просмотр папки не меняет задачи; внешний переход показывает родителя выбранного контейнера. */
export function useTaskHierarchy({
  state,
  location,
  hiddenIds = [],
}: Pick<TaskProjectSidebarProps, "state" | "location" | "hiddenIds">) {
  const [showHidden, setShowHidden] = useState(false);
  const [browsing, setBrowsing] = useState<{
    location: TaskLocation;
    selectionKey: string;
  } | null>(null);
  const [search, setSearch] = useState({ key: "", value: "" });
  const navigationRef = useRef<HTMLElement>(null);
  const focusAfterBrowse = useRef(false);
  const path = getLocationPath(state, location);
  const workspace =
    state.workspaces.find(
      (entry) =>
        entry.id === path[0]?.id && getWorkspaceAccess(state, entry).canRead,
    ) ??
    state.workspaces.find(
      (entry) => !entry.archived && getWorkspaceAccess(state, entry).canRead,
    ) ??
    state.workspaces.find((entry) => getWorkspaceAccess(state, entry).canRead);
  const workspaceLocation: TaskLocation | undefined = workspace
    ? { kind: "workspace", id: workspace.id }
    : undefined;
  const selectionKey = `${location.kind}:${location.id}`;
  const [previousSelection, setPreviousSelection] = useState(selectionKey);
  if (previousSelection !== selectionKey) {
    // Инвалидируем прошлый просмотр, чтобы переход A → B → A не оживлял старую папку/поиск.
    setPreviousSelection(selectionKey);
    setBrowsing(null);
    setSearch({ key: "", value: "" });
  }
  const overridePath = browsing
    ? getLocationPath(state, browsing.location)
    : [];
  const browseLocation =
    browsing?.selectionKey === selectionKey &&
    overridePath[0]?.id === workspace?.id
      ? browsing.location
      : (path.at(-2) ?? workspaceLocation);
  const browsePath = browseLocation
    ? getLocationPath(state, browseLocation)
    : [];
  const context = browsePath.at(-1);
  const parent = browsePath.at(-2);
  const projectId = browsePath.find((entry) => entry.kind === "project")?.id;
  const root = browseLocation?.kind === "workspace";
  const browseKey = browseLocation
    ? `${browseLocation.kind}:${browseLocation.id}`
    : "";
  const queryKey = `${selectionKey}/${browseKey}`;
  const query = search.key === queryKey ? search.value : "";
  useEffect(() => {
    if (!focusAfterBrowse.current) return;
    focusAfterBrowse.current = false;
    navigationRef.current?.focus({ preventScroll: true });
  }, [browseKey]);
  const makeNode = (
    target: TaskLocation,
    name: string,
  ): TaskHierarchyEntry => ({
    location: target,
    name,
    appearance: getTaskLocationAppearance(state, target),
    count: getLocationTasks(state, target).length,
    hidden: hiddenIds.includes(taskLocationNavigationId(target)),
  });
  const nodes = !browseLocation
    ? []
    : root
      ? state.projects
          .filter((entry) => entry.workspaceId === workspace?.id)
          .map((entry) =>
            makeNode({ kind: "project", id: entry.id }, entry.name),
          )
      : [
          ...state.folders
            .filter(
              (entry) =>
                entry.projectId === projectId &&
                entry.parentId ===
                  (browseLocation.kind === "folder" ? browseLocation.id : null),
            )
            .map((entry) =>
              makeNode({ kind: "folder", id: entry.id }, entry.name),
            ),
          ...state.lists
            .filter(
              (entry) =>
                entry.projectId === projectId &&
                entry.folderId ===
                  (browseLocation.kind === "folder" ? browseLocation.id : null),
            )
            .map((entry) =>
              makeNode({ kind: "list", id: entry.id }, entry.name),
            ),
        ];
  const creationOptions: TaskHierarchyCreationOption[] =
    root && workspace
      ? [
          {
            label: "Создать проект",
            creation: { kind: "project", workspaceId: workspace.id },
          },
        ]
      : projectId && browseLocation
        ? [
            {
              label: "Создать папку",
              creation: {
                kind: "folder",
                projectId,
                parentId:
                  browseLocation.kind === "folder" ? browseLocation.id : null,
              },
            },
            {
              label: "Создать список",
              creation: {
                kind: "list",
                projectId,
                folderId:
                  browseLocation.kind === "folder" ? browseLocation.id : null,
              },
            },
          ]
        : [];
  return {
    workspace,
    workspaceLocation,
    context,
    parent,
    root,
    browsePath,
    query,
    showHidden,
    setShowHidden,
    hiddenCount: nodes.filter((node) => node.hidden).length,
    contextHidden: Boolean(
      context && hiddenIds.includes(taskLocationNavigationId(context)),
    ),
    canWrite: getWorkspaceAccess(state, workspace).canWrite,
    setQuery: (value: string) => setSearch({ key: queryKey, value }),
    navigationRef,
    nodes: nodes.filter(
      (node) =>
        (showHidden || !node.hidden) &&
        node.name
          .toLocaleLowerCase("ru")
          .includes(query.trim().toLocaleLowerCase("ru")),
    ),
    creationOptions: getWorkspaceAccess(state, workspace).canWrite
      ? creationOptions
      : [],
    browse: (target: TaskLocation) => {
      focusAfterBrowse.current = true;
      setBrowsing({ location: target, selectionKey });
      setSearch({ key: "", value: "" });
    },
  };
}
