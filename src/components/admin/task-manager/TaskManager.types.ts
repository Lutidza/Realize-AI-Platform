/**
 * @file src/components/admin/task-manager/TaskManager.types.ts
 * @version 2.0.0
 * @date 2026-11-26
 * @description Описывает свойства рабочего интерфейса и клиентский транспорт постоянных задач.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  TaskCreateInput,
  TaskDto,
  TaskEditableFields,
  TaskEventDto,
  TaskGitBinding,
  TaskGitObservationsDto,
  TaskGitSyncDto,
  TaskGitSyncInput,
  TaskListDto,
  TaskPageDto,
  TaskParticipantDto,
  TaskProjectCreateInput,
  TaskProjectDto,
  TaskUpdateInput,
} from "@realize/payload-task-manager/contracts";
import type { SystemAdminContext } from "../system-shell/systemAdmin.types";

/** Host передаёт безопасную сессию; право записи повторно проверяет API. */
export type TaskManagerWorkbenchProps = Omit<SystemAdminContext, "appearance">;

/** Клиент получает только публичные DTO; mutations всегда имеют ключ повторной доставки. */
export type TaskManagerTransport = {
  projects: (
    after?: string | null,
    signal?: AbortSignal,
  ) => Promise<TaskPageDto<TaskProjectDto>>;
  lists: (
    projectId: string,
    after?: string | null,
    signal?: AbortSignal,
  ) => Promise<TaskPageDto<TaskListDto>>;
  participants: (
    after?: string | null,
    signal?: AbortSignal,
  ) => Promise<TaskPageDto<TaskParticipantDto>>;
  tasks: (
    projectId: string,
    listId: string,
    after?: string | null,
    signal?: AbortSignal,
  ) => Promise<TaskPageDto<TaskDto>>;
  task: (id: string, signal?: AbortSignal) => Promise<TaskDto>;
  gitObservations: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<TaskGitObservationsDto>;
  gitSyncs: (
    id: string,
    after?: string | null,
    signal?: AbortSignal,
  ) => Promise<TaskPageDto<TaskGitSyncDto>>;
  syncGit: (
    id: string,
    input: TaskGitSyncInput,
    key: string,
    signal?: AbortSignal,
  ) => Promise<TaskGitSyncDto>;
  events: (
    id: string,
    after?: string | null,
    signal?: AbortSignal,
  ) => Promise<TaskPageDto<TaskEventDto>>;
  createProject: (
    input: TaskProjectCreateInput,
    key: string,
  ) => Promise<TaskProjectDto>;
  createTask: (input: TaskCreateInput, key: string) => Promise<TaskDto>;
  updateTask: (
    id: string,
    input: TaskUpdateInput,
    key: string,
  ) => Promise<TaskDto>;
};

export type TaskEditorProps = {
  task: TaskDto | null;
  projectId: string;
  listId: string;
  theme: "light" | "dark";
  participants: TaskParticipantDto[];
  moreParticipants: boolean;
  onMoreParticipants: () => void;
  onClose: () => void;
  onSave: (
    fields: TaskEditableFields,
    expectedRevision: number | null,
    key: string,
  ) => Promise<TaskDto>;
  onReload: (id: string) => Promise<TaskDto>;
};

export type TaskProjectComposerProps = {
  theme: "light" | "dark";
  currentActor: TaskParticipantDto;
  participants: TaskParticipantDto[];
  moreParticipants: boolean;
  onMoreParticipants: () => void;
  onClose: () => void;
  onSave: (
    input: TaskProjectCreateInput,
    key: string,
  ) => Promise<TaskProjectDto>;
};

export type TaskDetailProps = {
  task: TaskDto;
  events: TaskEventDto[];
  participants: TaskParticipantDto[];
  moreEvents: boolean;
  eventsLoading: boolean;
  onMoreEvents: () => void;
  onEdit: () => void;
  onClose: () => void;
};

export type TaskGitBindingsEditorProps = {
  value: TaskGitBinding[];
  onChange: (bindings: TaskGitBinding[]) => void;
};
