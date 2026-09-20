/**
 * @file src/components/admin/task-manager/reference/useTaskComposer.hook.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Удерживает независимый черновик формы до успешной атомарной команды.
 * @see documentation/specifications/task-management.md
 */

import { useRef, useState } from "react";
import { createTaskDraft, taskToDraft } from "./taskManager.draft";
import type { TaskCreateDialogProps } from "./TaskComposer.types";
import type { TaskDraft } from "./taskManager.types";

/** Отказ модели оставляет все поля открытого редактора; успешное сохранение обходит discard guard. */
export function useTaskComposer(props: TaskCreateDialogProps) {
  const [initial] = useState(() => {
    if (props.task) return taskToDraft(props.task);
    const parent = props.tasks.find((task) => task.id === props.parentId);
    const requestedList = props.hierarchy.lists.find(
      (list) => list.id === props.listId,
    );
    const projectId =
      parent?.projectId ??
      props.projectId ??
      requestedList?.projectId ??
      props.hierarchy.projects[0]?.id ??
      "";
    // Подзадача наследует контейнер родителя. Явный неверный listId остаётся для ошибки модели.
    const listId =
      parent?.listId ??
      props.listId ??
      props.hierarchy.lists.find((list) => list.projectId === projectId)?.id ??
      "";
    return {
      ...createTaskDraft(projectId, props.parentId, listId),
      status: props.initialStatus ?? "backlog",
    };
  });
  const [draft, setDraft] = useState<TaskDraft>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const change = (next: TaskDraft) => {
    setDraft(next);
    setFieldErrors({});
    setError("");
  };
  const close = () => {
    if (dirty) setDiscardOpen(true);
    else props.onClose();
  };
  const save = () => {
    const result = props.dispatch(
      props.task
        ? { type: "task/save", taskId: props.task.id, draft }
        : { type: "task/create", draft },
    );
    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setError(result.message);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    props.onClose();
    if (!props.task && result.taskId)
      props.onCreated?.(result.taskId, draft.projectId, draft.listId);
  };
  return {
    draft,
    change,
    fieldErrors,
    error,
    errorRef,
    dirty,
    close,
    save,
    discardOpen,
    setDiscardOpen,
  };
}
