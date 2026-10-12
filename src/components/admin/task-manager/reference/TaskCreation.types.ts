/**
 * @file src/components/admin/task-manager/reference/TaskCreation.types.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Задаёт общий frame существующих форм и контекст единого создания.
 * @see documentation/specifications/task-management.md
 */
import type { ReactNode } from "react";
import type { SystemAdminLocale } from "@realize/template-realize/ui";
import type {
  HierarchyCreation,
  PrototypeDispatch,
  PrototypeHierarchy,
  PrototypeState,
  TaskLocation,
} from "./taskManager.types";

export type TaskCreationKind = "task" | HierarchyCreation["kind"];
/** Владелец формы сохраняет draft и сообщает dirty; frame отвечает только за выбор типа. */
export type TaskCreationFrameProps = {
  renderCreation?: (content: ReactNode, dirty: boolean) => ReactNode;
};
export type TaskCreationContext = {
  hierarchy: PrototypeHierarchy;
  workspaceId: string;
  projectId: string;
  folderId: string | null;
  listId: string | null;
};
export type TaskCreationHubProps = {
  kind: TaskCreationKind;
  onKindChange: (kind: TaskCreationKind) => void;
  state: PrototypeState;
  location: TaskLocation;
  dispatch: PrototypeDispatch;
  theme: "light" | "dark";
  locale: SystemAdminLocale;
  onClose: () => void;
  onCreated: (location: TaskLocation, taskId?: string) => void;
};
export type TaskCreationTabsProps = Pick<
  TaskCreationHubProps,
  "kind" | "onKindChange" | "theme" | "locale"
> & {
  dirty: boolean;
  children: ReactNode;
};
export type TaskHierarchyParentPickerProps = {
  state: PrototypeState;
  location: HierarchyCreation;
  onChange: (location: HierarchyCreation) => void;
};
