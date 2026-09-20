/**
 * @file src/components/admin/task-manager/reference/TaskHierarchyComposer.types.ts
 * @version 1.1.0
 * @date 2026-09-19
 * @description Определяет форму создания контейнера задач с начальным родительским контекстом.
 * @see documentation/specifications/task-management.md
 */

import type { TaskCreationFrameProps } from "./TaskCreation.types";
import type {
  HierarchyCreation,
  PrototypeDispatch,
  PrototypeState,
  TaskLocation,
} from "./taskManager.types";

/** Навигация задаёт родителя; общий frame позволяет изменить его до атомарного создания. */
export type TaskHierarchyCreateDialogProps = TaskCreationFrameProps & {
  location: HierarchyCreation;
  state: PrototypeState;
  theme: "light" | "dark";
  dispatch: PrototypeDispatch;
  onClose: () => void;
  onCreated: (location: TaskLocation) => void;
};
