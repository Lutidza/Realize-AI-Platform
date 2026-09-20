/**
 * @file src/components/admin/task-manager/reference/useTaskWorkbench.hook.ts
 * @version 2.1.0
 * @date 2026-09-18
 * @description Управляет фильтрами, навигацией и ссылкой на задачу без записи данных в host.
 */

import {
  getLocationWorkspace,
  getWorkspaceAccess,
} from "./taskWorkspace.access";
import { useEffect, useEffectEvent, useState } from "react";
import type {
  HierarchyCreation,
  PrototypeActor,
  PrototypeState,
  TaskLocation,
} from "./taskManager.types";
import {
  getLocationInfo,
  getLocationPath,
  getLocationTasks,
} from "./taskManager.hierarchy";
import type { TaskColumn, TaskCreation, TaskView } from "./TaskWorkbench.types";
import { defaultTaskFilters } from "./taskWorkbench.constants";

export function useTaskWorkbench(
  state: PrototypeState,
  actors: PrototypeActor[],
  initialTheme: "light" | "dark",
  readState: () => PrototypeState = () => state,
) {
  const [theme, setTheme] = useState(initialTheme);
  const [location, setLocation] = useState<TaskLocation>({
    kind: "project",
    id: "p-realize",
  });
  const [view, setView] = useState<TaskView>("list");
  const [archived, setArchived] = useState(false);
  const [filters, setFilters] = useState(defaultTaskFilters);
  const [columns, setColumns] = useState<TaskColumn[]>([
    "people",
    "due",
    "priority",
  ]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [creation, setCreation] = useState<TaskCreation | null>(null);
  const [hierarchyCreation, setHierarchyCreation] =
    useState<HierarchyCreation | null>(null);
  const workspaceAccess = getWorkspaceAccess(
    state,
    getLocationWorkspace(state, location),
  );
  const path = workspaceAccess.canRead ? getLocationPath(state, location) : [];
  const workspaceId =
    path.find((item) => item.kind === "workspace")?.id ??
    state.workspaces.find(
      (workspace) => getWorkspaceAccess(state, workspace).canRead,
    )?.id ??
    "";
  const projectId = path.find((item) => item.kind === "project")?.id ?? null;
  const availableLists = state.lists.filter(
    (list) =>
      workspaceAccess.canRead &&
      getLocationPath(state, { kind: "list", id: list.id }).some(
        (item) => item.kind === location.kind && item.id === location.id,
      ),
  );
  const defaultList = availableLists[0];
  const locationInfo = workspaceAccess.canRead
    ? getLocationInfo(state, location)
    : undefined;
  const emptyCreation: HierarchyCreation = projectId
    ? {
        kind: "list",
        projectId,
        folderId: location.kind === "folder" ? location.id : null,
      }
    : {
        kind: "project",
        workspaceId,
      };
  const createTask = (status: "backlog" | "ready" = "backlog") => {
    if (!workspaceAccess.canWrite) return;
    if (defaultList) setCreation({ kind: "task", status });
    else setHierarchyCreation(emptyCreation);
  };
  const restoreTaskFromHash = useEffectEvent(() => {
    const id = new URLSearchParams(window.location.hash.slice(1)).get("task");
    const task = state.tasks.find(
      (item) =>
        item.id === id &&
        getWorkspaceAccess(
          state,
          getLocationWorkspace(state, { kind: "project", id: item.projectId }),
        ).canRead,
    );
    setSelectedTaskId(task?.id ?? null);
    if (
      task &&
      (task.archived !== archived ||
        !getLocationTasks(state, location, archived).some(
          (item) => item.id === id,
        ))
    ) {
      setLocation({ kind: "list", id: task.listId });
      setArchived(task.archived);
      setSelected([]);
      setFilters(defaultTaskFilters);
    }
  });
  useEffect(() => {
    const readHash = () => restoreTaskFromHash();
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);
  const onOpenTask = (id: string) => {
    // После синхронного create React ещё может не отрисовать новый снимок.
    const current = readState();
    const task = current.tasks.find(
      (item) =>
        item.id === id &&
        getWorkspaceAccess(
          current,
          getLocationWorkspace(current, {
            kind: "project",
            id: item.projectId,
          }),
        ).canRead,
    );
    if (
      task &&
      (task.archived !== archived ||
        !getLocationTasks(current, location, archived).some(
          (item) => item.id === id,
        ))
    ) {
      setLocation({ kind: "list", id: task.listId });
      setArchived(task.archived);
      setSelected([]);
      setFilters(defaultTaskFilters);
    }
    if (!task) return;
    setSelectedTaskId(id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#task=${encodeURIComponent(id)}`,
    );
  };
  const closeTask = () => {
    setSelectedTaskId(null);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  };
  const navigateLocation = (
    nextLocation: TaskLocation,
    nextView: TaskView = "list",
    showArchive = false,
  ) => {
    const current = readState();
    if (
      !getWorkspaceAccess(current, getLocationWorkspace(current, nextLocation))
        .canRead
    )
      return;
    setLocation(nextLocation);
    setView(nextView);
    setArchived(showArchive);
    setSelected([]);
    setFilters(defaultTaskFilters);
    closeTask();
    setCreation(null);
    setHierarchyCreation(null);
  };
  const navigate = (
    id: string | null,
    nextView: TaskView = "list",
    showArchive = false,
  ) =>
    navigateLocation(
      id ? { kind: "project", id } : { kind: "workspace", id: workspaceId },
      nextView,
      showArchive,
    );
  const projectTasks = workspaceAccess.canRead
    ? getLocationTasks(state, location, archived)
    : [];
  const query = filters.query.trim().toLocaleLowerCase("ru");
  const tasks = projectTasks.filter(
    (task) =>
      (!query ||
        `${task.id} ${task.title} ${task.tags.join(" ")}`
          .toLocaleLowerCase("ru")
          .includes(query)) &&
      (filters.priority === "all" || task.priority === filters.priority) &&
      (filters.status === "all" || task.status === filters.status) &&
      (filters.actor === "all" ||
        [...task.roles.executor, ...task.coexecutorIds].some(
          (id) =>
            id === filters.actor ||
            actors.find((actor) => actor.id === id)?.kind === filters.actor,
        )),
  );
  if (filters.sort === "due")
    tasks.sort((a, b) =>
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999"),
    );
  if (filters.sort === "title")
    tasks.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  if (filters.sort === "priority") {
    const order = ["urgent", "high", "normal", "low"];
    tasks.sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
  }
  return {
    workspaceAccess,
    theme,
    setTheme,
    projectId,
    workspaceId,
    location,
    locationInfo,
    path,
    defaultList,
    emptyCreation,
    hierarchyCreation,
    setHierarchyCreation,
    createTask,
    navigateLocation,
    view,
    setView,
    archived,
    filters,
    setFilters,
    columns,
    setColumns,
    selected,
    setSelected,
    selectedTaskId,
    creation,
    setCreation,
    projectTasks,
    tasks,
    navigate,
    onOpenTask,
    closeTask,
  };
}
