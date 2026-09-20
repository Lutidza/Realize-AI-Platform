/**
 * @file src/components/admin/task-manager/reference/taskWorkspace.types.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Определяет настройки, членство и команды рабочей среды локального референса.
 * @see documentation/specifications/task-management-execution.md
 */

export type WorkspaceMemberRole = "admin" | "member" | "guest";
export type WorkspaceMember = { actorId: string; role: WorkspaceMemberRole };
export type WorkspaceColor = "purple" | "blue" | "green" | "amber" | "rose";
export type WorkspaceIcon = "layers" | "briefcase" | "rocket" | "building";
export type WorkspaceDraft = {
  name: string;
  description: string;
  color: WorkspaceColor;
  icon: WorkspaceIcon;
  timezone: string;
  workingDays: number[];
  visibility: "private" | "internal";
};
export type PrototypeWorkspace = WorkspaceDraft & {
  id: string;
  initials: string;
  ownerId: string;
  members: WorkspaceMember[];
  archived: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type WorkspaceAction =
  | { type: "workspace/create"; draft: WorkspaceDraft }
  | {
      type: "workspace/save";
      workspaceId: string;
      expectedRevision: number;
      draft: WorkspaceDraft;
    }
  | {
      type: "workspace/member";
      workspaceId: string;
      expectedRevision: number;
      actorId: string;
      role: WorkspaceMemberRole | null;
    }
  | {
      type: "workspace/archive";
      workspaceId: string;
      expectedRevision: number;
      archived: boolean;
    };
export type WorkspaceTab = "general" | "members" | "manage";
