/**
 * @file src/components/admin/task-manager/reference/TaskComposer.types.ts
 * @version 2.1.0
 * @date 2026-09-19
 * @description Описывает общий контракт создания и полного редактирования задачи.
 * @see documentation/specifications/task-management.md
 */

import type { TaskCreationFrameProps } from "./TaskCreation.types";
import type {
  PrototypeActor,
  PrototypeConversation,
  PrototypeDispatch,
  PrototypeHierarchy,
  PrototypeTask,
  TaskDraft,
  TaskChecklist,
  TaskCriterion,
  GitLink,
} from "./taskManager.types";

/** Создание и редактирование получают полный каталог; подзадача наследует контейнер родителя. */
export type TaskCreateDialogProps = TaskCreationFrameProps & {
  kind: "task";
  initialStatus?: "backlog" | "ready";
  initialTab?: "details" | "people" | "checklists" | "relations" | "git";
  hierarchy: PrototypeHierarchy;
  projectId: string | null;
  listId?: string | null;
  actors: PrototypeActor[];
  tasks: PrototypeTask[];
  conversations: PrototypeConversation[];
  task?: PrototypeTask;
  parentId?: string;
  theme: "light" | "dark";
  onClose: () => void;
  onCreated?: (id: string, projectId: string, listId: string) => void;
  dispatch: PrototypeDispatch;
};

/** Все вкладки изменяют один draft; проект и List выбираются из переданной иерархии. */
export type TaskDraftEditorProps = Pick<
  TaskCreateDialogProps,
  "actors" | "hierarchy" | "tasks" | "conversations"
> & {
  draft: TaskDraft;
  /** Компактное создание раскрывает полный редактор без второго draft. */
  compact?: boolean;
  taskId?: string;
  initialTab?: TaskCreateDialogProps["initialTab"];
  fieldErrors: Record<string, string>;
  onChange: (draft: TaskDraft) => void;
};

export type TaskPeoplePickerProps = {
  label: string;
  actors: PrototypeActor[];
  value: string[];
  onChange: (ids: string[]) => void;
};
export type TaskChecklistEditorProps = {
  value: TaskChecklist[];
  actors: PrototypeActor[];
  fieldErrors: Record<string, string>;
  onChange: (value: TaskChecklist[]) => void;
};
export type TaskCriteriaEditorProps = {
  value: TaskCriterion[];
  fieldErrors: Record<string, string>;
  onChange: (value: TaskCriterion[]) => void;
};
export type TaskGitLinksEditorProps = {
  value: GitLink[];
  fieldErrors: Record<string, string>;
  onChange: (value: GitLink[]) => void;
};
