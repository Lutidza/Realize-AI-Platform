/**
 * @file src/components/admin/task-manager/reference/WorkspaceViews.types.ts
 * @version 1.3.0
 * @date 2026-09-19
 * @description Определяет контракты экранов и форм управления рабочими средами.
 * @see documentation/specifications/task-management.md
 */

import type { TaskCreationFrameProps } from "./TaskCreation.types";
import type { SystemAdminLocale } from "@realize/ui-kit";
import type {
  CommandResult,
  PrototypeActor,
  PrototypeDispatch,
  PrototypeState,
} from "./taskManager.types";
import type {
  PrototypeWorkspace,
  WorkspaceDraft,
  WorkspaceTab,
} from "./taskWorkspace.types";
import type { useWorkspaceComposer } from "./useWorkspaceComposer.hook";
import type { useWorkspaceManager } from "./useWorkspaceManager.hook";

export type WorkspaceComposer = ReturnType<typeof useWorkspaceComposer>;
export type WorkspaceGeneralFieldsProps = {
  composer: WorkspaceComposer;
  disabled?: boolean;
  includeAccess?: boolean;
};
export type WorkspaceCreateDialogProps = TaskCreationFrameProps & {
  theme: "light" | "dark";
  dispatch: PrototypeDispatch;
  onClose: () => void;
  onCreated: (id: string) => void;
};
export type WorkspaceCatalogProps = {
  state: PrototypeState;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onSettings: (id: string, tab?: WorkspaceTab) => void;
};
export type WorkspaceSettingsProps = {
  state: PrototypeState;
  actors: PrototypeActor[];
  manager: ReturnType<typeof useWorkspaceManager>;
  dispatch: PrototypeDispatch;
  onQueue: () => void;
};
export type WorkspaceManagerDialogsProps = {
  theme: "light" | "dark";
  manager: ReturnType<typeof useWorkspaceManager>;
  lastResult: CommandResult;
};
export type WorkspaceMembersProps = {
  state: PrototypeState;
  workspace: PrototypeWorkspace;
  actors: PrototypeActor[];
  dispatch: PrototypeDispatch;
  disabled: boolean;
};
export type WorkspaceSwitcherProps = {
  locale?: SystemAdminLocale;
  variant?: "navigation" | "toolbar";
  state: PrototypeState;
  workspace?: PrototypeWorkspace;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onCatalog: () => void;
  onSettings: () => void;
};
export type WorkspaceComposerPersist = (draft: WorkspaceDraft) => CommandResult;
export type WorkspaceNavigation =
  | { kind: "settings"; id: string; tab: WorkspaceTab }
  | { kind: "action"; run: () => void };
