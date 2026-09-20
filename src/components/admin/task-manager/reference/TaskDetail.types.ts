/**
 * @file src/components/admin/task-manager/reference/TaskDetail.types.ts
 * @version 2.0.0
 * @date 2026-09-17
 * @description Задаёт свойства карточки и её разделов для единой демонстрационной модели.
 */

import type {
  PrototypeDispatch,
  PrototypeActor,
  PrototypeState,
  PrototypeTask,
} from "./taskManager.types";

export type TaskDetailDrawerProps = {
  task: PrototypeTask | null;
  state: PrototypeState;
  actors: PrototypeActor[];
  theme: "light" | "dark";
  dispatch: PrototypeDispatch;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onCreateSubtask: (parentId: string) => void;
};

export type TaskDetailSectionProps = Pick<
  TaskDetailDrawerProps,
  "state" | "dispatch" | "onOpenTask"
> & { task: PrototypeTask };
export type TaskExecutionProps = Pick<
  TaskDetailDrawerProps,
  "actors" | "dispatch"
> & { task: PrototypeTask };

export type TaskDetailOverviewProps = TaskExecutionProps &
  Pick<TaskDetailDrawerProps, "state" | "onOpenTask" | "onCreateSubtask"> & {
    onEdit: (tab?: "details" | "people" | "checklists" | "git") => void;
  };
export type TaskDetailActivityProps = Pick<
  TaskExecutionProps,
  "task" | "dispatch"
>;
