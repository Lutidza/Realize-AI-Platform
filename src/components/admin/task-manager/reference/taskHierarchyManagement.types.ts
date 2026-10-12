/**
 * @file src/components/admin/task-manager/reference/taskHierarchyManagement.types.ts
 * @version 1.1.1
 * @date 2026-10-12
 * @description Определяет команды и UI-контракт настроек и удаления контейнеров reference.
 * @see documentation/specifications/task-management.md
 */
import type { SystemAdminNavigationPreferences } from "@realize/template-realize/ui";
import type {
  PrototypeDispatch,
  PrototypeState,
  TaskLocation,
} from "./taskManager.types";
import type { useTaskHierarchyManager } from "./useTaskHierarchyManager.hook";
import type { getTaskLocationAppearance } from "./taskLocationAppearance";

export type ManagedTaskLocation = TaskLocation & {
  kind: "project" | "folder" | "list";
};
export type TaskHierarchyManagementAction =
  | {
      type: "hierarchy/save";
      location: ManagedTaskLocation;
      name: string;
      description: string;
      /** undefined сохраняет картинку, null удаляет; строка — нормализованный локальный avatar. */
      avatar?: string | null;
    }
  | { type: "hierarchy/delete"; location: ManagedTaskLocation };
export type TaskHierarchyManagerProps = {
  state: PrototypeState;
  dispatch: PrototypeDispatch;
  preferences?: SystemAdminNavigationPreferences;
  onPreferencesChange: (preferences: SystemAdminNavigationPreferences) => void;
  onDeleted: (parent: TaskLocation, removed: TaskLocation[]) => void;
};
export type TaskHierarchyManagerDialogsProps = {
  theme: "light" | "dark";
  manager: ReturnType<typeof useTaskHierarchyManager>;
};

export type TaskContainerAvatarEditorProps = {
  appearance: ReturnType<typeof getTaskLocationAppearance>;
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled: boolean;
  loading: boolean;
  onLoadingChange: (loading: boolean) => void;
};
