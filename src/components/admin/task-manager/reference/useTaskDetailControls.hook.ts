/**
 * @file src/components/admin/task-manager/reference/useTaskDetailControls.hook.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Управляет вкладками карточки, вложенным редактором, действиями и возвратом фокуса.
 * @see documentation/specifications/task-management.md
 */

import { useRef, useState } from "react";
import type { TaskDetailDrawerProps } from "./TaskDetail.types";
import type { TaskCreateDialogProps } from "./TaskComposer.types";

export function useTaskDetailControls({
  task,
  dispatch,
  onOpenTask,
}: Pick<TaskDetailDrawerProps, "task" | "dispatch" | "onOpenTask">) {
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [editingTab, setEditingTab] =
    useState<TaskCreateDialogProps["initialTab"]>("details");
  const [localNotice, setLocalNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openLinkedTask = (id: string) => {
    setTab("overview");
    setLocalNotice("");
    onOpenTask(id);
    requestAnimationFrame(() => heading.current?.focus());
  };
  const duplicate = () => {
    if (!task) return;
    const result = dispatch({ type: "task/duplicate", taskId: task.id });
    if (result.ok && result.taskId) openLinkedTask(result.taskId);
  };
  const copy = async (kind: "id" | "link") => {
    if (!task) return;
    try {
      const link = new URL(window.location.href);
      link.hash = `task=${encodeURIComponent(task.id)}`;
      await navigator.clipboard.writeText(kind === "id" ? task.id : link.href);
      setLocalNotice(
        kind === "id"
          ? "ID задачи скопирован."
          : "Ссылка скопирована. Новые демозадачи доступны только в текущем сеансе.",
      );
    } catch {
      setLocalNotice(
        "Не удалось скопировать: браузер запретил доступ к буферу обмена.",
      );
    }
  };
  return {
    tab,
    setTab,
    editing,
    setEditing,
    editingTab,
    setEditingTab,
    localNotice,
    heading,
    openLinkedTask,
    duplicate,
    copy,
    onOpenAutoFocus: (event: Event) => {
      event.preventDefault();
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      heading.current?.focus();
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    },
  };
}
