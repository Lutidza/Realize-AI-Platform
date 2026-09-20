/**
 * @file src/components/admin/task-manager/reference/taskManager.types.ts
 * @version 5.2.0
 * @date 2026-09-18
 * @description Определяет изолированную демонстрационную модель таск-менеджера.
 * @see documentation/specifications/task-management.md
 */

import type {
  PrototypeWorkspace,
  WorkspaceAction,
} from "./taskWorkspace.types";
export type { PrototypeWorkspace } from "./taskWorkspace.types";
import type { TaskHierarchyManagementAction } from "./taskHierarchyManagement.types";

export type TaskStatus =
  "backlog" | "ready" | "in_progress" | "review" | "done";
export type TaskRole = "requester" | "executor" | "tester" | "observer";
export type RunState =
  | "idle"
  | "queued"
  | "blocked"
  | "running"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled";
export type RunCommand =
  "enqueue" | "pause" | "resume" | "cancel" | "complete" | "fail" | "retry";
export type PrototypeActor = {
  id: string;
  name: string;
  kind: "human" | "agent";
  initials: string;
  specialty: string;
};
export type PrototypeProject = {
  avatar?: string;
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  initials: string;
};
export type PrototypeFolder = {
  avatar?: string;
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  description?: string;
};
export type PrototypeTaskList = {
  avatar?: string;
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  description: string;
};
/** Контейнер задаёт область показа; способ представления задач выбирается независимо. */
export type TaskLocation = {
  kind: "workspace" | "project" | "folder" | "list";
  id: string;
};
export type HierarchyCreation =
  | { kind: "workspace" }
  | { kind: "project"; workspaceId: string }
  | { kind: "folder"; projectId: string; parentId: string | null }
  | { kind: "list"; projectId: string; folderId: string | null };
export type PrototypeConversation = {
  id: string;
  title: string;
  purpose: string;
  messages: { id: string; author: string; text: string }[];
};
export type TaskCriterion = { id: string; title: string; done: boolean };
export type TaskChecklistItem = {
  id: string;
  title: string;
  done: boolean;
  assigneeId: string | null;
  dueDate: string;
  required: boolean;
};
export type TaskChecklist = {
  id: string;
  title: string;
  items: TaskChecklistItem[];
};
export type GitLink = {
  id: string;
  kind: "branch" | "commit" | "push" | "pull_request" | "build" | "release";
  label: string;
  url: string;
  repository: string;
  revision: string;
  source: "manual" | "demo";
  status: "unverified" | "succeeded" | "failed" | "pending";
};
export type PrototypeTask = {
  id: string;
  projectId: string;
  listId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: "urgent" | "high" | "normal" | "low";
  taskType: "task" | "bug" | "milestone";
  parentId: string | null;
  archived: boolean;
  startDate: string;
  dueDate: string;
  estimateMinutes: number | null;
  roles: Record<TaskRole, string[]>;
  coexecutorIds: string[];
  tags: string[];
  workflow: string;
  profile: string;
  mode: "manual" | "staged" | "automatic";
  dependsOn: string[];
  related: string[];
  conversationIds: string[];
  criteria: TaskCriterion[];
  checklists: TaskChecklist[];
  gitLinks: GitLink[];
  artifacts: { id: string; path: string; content: string; version: number }[];
  activity: { id: string; author: string; text: string; time: string }[];
  handoff?: {
    toActorId: string;
    kind: "transfer" | "delegate";
    scope: string;
    state: "pending" | "accepted" | "rejected";
  };
  run: { state: RunState; reason?: string; attempt: number };
};
export type TaskDraft = Pick<
  PrototypeTask,
  | "projectId"
  | "listId"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "taskType"
  | "parentId"
  | "startDate"
  | "dueDate"
  | "estimateMinutes"
  | "roles"
  | "coexecutorIds"
  | "tags"
  | "workflow"
  | "profile"
  | "mode"
  | "dependsOn"
  | "related"
  | "conversationIds"
  | "criteria"
  | "checklists"
  | "gitLinks"
>;
export type CommandResult = {
  ok: boolean;
  message: string;
  taskId?: string;
  location?: TaskLocation;
  removedLocations?: TaskLocation[];
  fieldErrors?: Record<string, string>;
};
export type PrototypeState = {
  currentActorId: string;
  workspaces: PrototypeWorkspace[];
  projects: PrototypeProject[];
  folders: PrototypeFolder[];
  lists: PrototypeTaskList[];
  tasks: PrototypeTask[];
  conversations: PrototypeConversation[];
  notice: string;
  lastResult: CommandResult;
};
export type PrototypeHierarchy = Pick<
  PrototypeState,
  "workspaces" | "projects" | "folders" | "lists"
>;
export type PrototypeAction =
  | WorkspaceAction
  | TaskHierarchyManagementAction
  | { type: "reset" }
  | {
      type: "hierarchy/create";
      location: HierarchyCreation;
      name: string;
      description: string;
    }
  | {
      type: "task/create";
      draft: TaskDraft;
    }
  | { type: "task/save"; taskId: string; draft: TaskDraft }
  | { type: "task/duplicate"; taskId: string }
  | { type: "task/archive"; taskId: string; archived: boolean }
  | { type: "task/checklists"; taskId: string; checklists: TaskChecklist[] }
  | { type: "task/git-links"; taskId: string; gitLinks: GitLink[] }
  | {
      type: "task/bulk";
      taskIds: string[];
      operation: "archive" | "restore" | "status";
      status?: TaskStatus;
    }
  | {
      type: "task/update";
      taskId: string;
      patch: Partial<
        Pick<
          PrototypeTask,
          | "title"
          | "description"
          | "priority"
          | "dueDate"
          | "workflow"
          | "profile"
          | "mode"
          | "taskType"
          | "startDate"
          | "estimateMinutes"
          | "tags"
        >
      >;
    }
  | { type: "task/status"; taskId: string; status: TaskStatus }
  | { type: "task/role"; taskId: string; role: TaskRole; actorIds: string[] }
  | { type: "task/criterion-toggle"; taskId: string; itemId: string }
  | { type: "task/comment"; taskId: string; text: string }
  | {
      type: "task/link";
      taskId: string;
      targetId: string;
      kind: "related" | "depends_on";
      remove?: boolean;
    }
  | { type: "task/conversation"; taskId: string; conversationId: string }
  | {
      type: "task/handoff";
      taskId: string;
      toActorId: string;
      kind: "transfer" | "delegate";
      scope: string;
    }
  | { type: "task/handoff-resolve"; taskId: string; accept: boolean }
  | { type: "task/run"; taskId: string; command: RunCommand };

/** Синхронный результат локальной команды позволяет сохранять draft при отказе. */
export type PrototypeDispatch = (action: PrototypeAction) => CommandResult;
export type PrototypeStore = {
  getSnapshot: () => PrototypeState;
  getServerSnapshot: () => PrototypeState;
  subscribe: (listener: () => void) => () => void;
  dispatch: PrototypeDispatch;
};
