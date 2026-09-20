/**
 * @file src/components/admin/task-manager/reference/TaskWorkbenchToolbar.types.ts
 * @version 1.2.0
 * @date 2026-09-19
 * @description Задаёт доменные входы верхней панели и доступные записи поисковой проекции.
 * @see documentation/architecture/system-admin-shell.md
 */
import type {
  PrototypeState,
  PrototypeDispatch,
  TaskLocation,
} from "./taskManager.types";
import type { SystemAdminLocale } from "@realize/ui-kit";
import type { useTaskWorkbench } from "./useTaskWorkbench.hook";
import type { useWorkspaceManager } from "./useWorkspaceManager.hook";

export type TaskWorkbenchToolbarProps = {
  locale: SystemAdminLocale;
  onLocaleChange: (locale: SystemAdminLocale) => void;
  state: PrototypeState;
  dispatch: PrototypeDispatch;
  ui: ReturnType<typeof useTaskWorkbench>;
  manager: ReturnType<typeof useWorkspaceManager>;
};
export type TaskToolbarSearchRecord = {
  id: string;
  label: string;
  description: string;
  group: string;
  keywords?: string;
  location: TaskLocation;
  taskId?: string;
};
export type TaskToolbarNotificationRecord = {
  id: string;
  label: string;
  description: string;
  taskId: string;
};

export type TaskAccountAvailabilityDialogProps = {
  view: "balance" | "topup" | null;
  theme: "light" | "dark";
  locale: SystemAdminLocale;
  onClose: () => void;
};
