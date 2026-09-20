/**
 * @file src/components/admin/task-manager/reference/TaskRowActions.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Вызывает создание подзадачи, дублирование и архивирование через общую модель.
 */

import { Archive, ArchiveRestore, Copy, ListPlus } from "lucide-react";
import { UiButton } from "@realize/ui-kit";
import type { TaskRowProps } from "./TaskWorkbench.types";
import styles from "./TaskViews.module.css";

export function TaskRowActions({
  task,
  dispatch,
  onCreateSubtask,
}: Pick<TaskRowProps, "task" | "dispatch" | "onCreateSubtask">) {
  return (
    <div className={styles.rowActions}>
      {!task.archived && (
        <UiButton
          variant="ghost"
          size="icon"
          aria-label={`Добавить подзадачу ${task.id}`}
          title="Добавить подзадачу"
          onClick={() => onCreateSubtask(task.id)}
        >
          <ListPlus size={15} />
        </UiButton>
      )}
      <UiButton
        variant="ghost"
        size="icon"
        aria-label={`Дублировать ${task.id}`}
        title="Дублировать"
        onClick={() => dispatch({ type: "task/duplicate", taskId: task.id })}
      >
        <Copy size={15} />
      </UiButton>
      <UiButton
        variant="ghost"
        size="icon"
        aria-label={`${task.archived ? "Восстановить" : "Архивировать"} ${task.id}`}
        title={task.archived ? "Восстановить" : "Архивировать"}
        onClick={() =>
          dispatch({
            type: "task/archive",
            taskId: task.id,
            archived: !task.archived,
          })
        }
      >
        {task.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
      </UiButton>
    </div>
  );
}
