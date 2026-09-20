/**
 * @file src/components/admin/task-manager/reference/TaskHierarchy.types.ts
 * @version 3.1.0
 * @date 2026-09-18
 * @description Определяет контракты одноуровневой навигации по проектам, папкам и спискам.
 * @see documentation/specifications/task-management-execution.md
 */

import type { RefObject } from "react";
import type { SystemAdminLocale, UiEntityMarkProps } from "@realize/ui-kit";
import type { getTaskLocationAppearance } from "./taskLocationAppearance";
import type {
  HierarchyCreation,
  PrototypeState,
  TaskLocation,
} from "./taskManager.types";

export type TaskProjectSidebarProps = {
  state: PrototypeState;
  location: TaskLocation;
  archived: boolean;
  onSelect: (location: TaskLocation) => void;
  onCatalog: () => void;
  catalogActive?: boolean;
  onCreate: (location: HierarchyCreation) => void;
  onArchive: () => void;
  onReset: () => void;
  onOverview?: () => void;
  variant?: "sidebar" | "flyout";
  hiddenIds?: string[];
  onLocationSettings: (location: TaskLocation) => void;
  onLocationDelete: (location: TaskLocation) => void;
  onLocationVisibility: (location: TaskLocation) => void;
};
export type TaskHierarchyCreationOption = {
  label: string;
  creation: HierarchyCreation;
};
export type TaskHierarchyEntry = {
  appearance: ReturnType<typeof getTaskLocationAppearance>;
  location: TaskLocation;
  name: string;
  count: number;
  hidden?: boolean;
};

export type TaskLocationMarkProps = {
  appearance: ReturnType<typeof getTaskLocationAppearance>;
  size?: UiEntityMarkProps["size"];
};
export type TaskWorkbenchBreadcrumbsProps = {
  state: PrototypeState;
  location: TaskLocation;
  archived: boolean;
  locale: SystemAdminLocale;
  onSelect: (location: TaskLocation) => void;
  onSettings: (location: TaskLocation) => void;
};
export type TaskHierarchyInteractions = {
  location: TaskLocation;
  archived: boolean;
  onSelect: (location: TaskLocation) => void;
  onBrowse: (location: TaskLocation) => void;
  onSettings: (location: TaskLocation) => void;
  onDelete: (location: TaskLocation) => void;
  onVisibility: (location: TaskLocation) => void;
  canWrite: boolean;
};
export type TaskHierarchyNodeProps = TaskHierarchyInteractions & {
  node: TaskHierarchyEntry;
};
export type TaskHierarchyTreeProps = TaskHierarchyInteractions & {
  nodes: TaskHierarchyEntry[];
  emptyText: string;
  navigationRef: RefObject<HTMLElement | null>;
};
export type TaskHierarchyItemMenuProps = Pick<
  TaskHierarchyInteractions,
  "onSelect" | "onSettings" | "onDelete" | "onVisibility" | "canWrite"
> & {
  target: TaskLocation;
  name: string;
  hidden?: boolean;
};
export type TaskHierarchyToolbarProps = Pick<
  TaskHierarchyItemMenuProps,
  "onSelect" | "onSettings" | "onDelete" | "onVisibility" | "canWrite"
> & {
  context?: TaskLocation & { name: string };
  parent?: TaskLocation & { name: string };
  hidden?: boolean;
  onBrowse: (location: TaskLocation) => void;
};
