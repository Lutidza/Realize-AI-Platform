/**
 * @file src/components/admin/task-manager/reference/TaskWorkbench.types.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Определяет контракты представлений и локальной навигации задач.
 * @see documentation/specifications/task-management.md
 */

import type {
  PrototypeActor,
  RunState,
  PrototypeDispatch,
  PrototypeState,
  PrototypeTask,
} from "./taskManager.types";

export type TaskView =
  "overview" | "list" | "board" | "table" | "queue" | "dialogs";
export type TaskFilters = {
  query: string;
  priority: string;
  status: string;
  actor: string;
  sort: string;
};
export type TaskColumn = "people" | "due" | "priority" | "progress" | "run";
export type TaskCreation = {
  kind: "task";
  status: "backlog" | "ready";
  parentId?: string;
};
export type TaskViewsProps = {
  filtered?: boolean;
  createLabel?: string;
  tasks: PrototypeTask[];
  allTasks: PrototypeTask[];
  actors: PrototypeActor[];
  view: "list" | "board" | "table";
  columns: TaskColumn[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  onOpenTask: (id: string) => void;
  onCreate: (status?: "backlog" | "ready") => void;
  onCreateSubtask: (parentId: string) => void;
  dispatch: PrototypeDispatch;
};
export type TaskRowProps = Pick<
  TaskViewsProps,
  "actors" | "columns" | "onOpenTask" | "onCreateSubtask" | "dispatch"
> & {
  task: PrototypeTask;
  selected: boolean;
  onSelect: () => void;
  childCount: number;
  tree?: {
    depth: number;
    expanded: boolean;
    contextOnly: boolean;
    onToggle?: () => void;
  };
};
export type TaskTreeRow = {
  task: PrototypeTask;
  depth: number;
  rootStatus: PrototypeTask["status"];
  contextOnly: boolean;
  childCount: number;
  expanded: boolean;
};
export type TaskQueueProps = Pick<
  TaskViewsProps,
  "tasks" | "actors" | "dispatch" | "onOpenTask"
> & { state: PrototypeState };
export type TaskOverviewProps = Pick<TaskViewsProps, "tasks" | "onOpenTask"> & {
  onQueue: () => void;
};

export type TaskManagerWorkbenchProps = { initialTheme?: "light" | "dark" };
export type TaskViewToolbarProps = {
  allowColumns: boolean;
  filters: TaskFilters;
  setFilters: (filters: TaskFilters) => void;
  actors: PrototypeActor[];
  count: number;
  columns: TaskColumn[];
  setColumns: (columns: TaskColumn[]) => void;
  theme: "light" | "dark";
};
export type TaskConversationsProps = Pick<
  TaskQueueProps,
  "tasks" | "state" | "onOpenTask"
>;
export type TaskParticipantsProps = { ids: string[]; actors: PrototypeActor[] };
export type TaskRunBadgeProps = { state: RunState };
