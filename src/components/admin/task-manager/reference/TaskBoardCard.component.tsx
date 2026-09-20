/**
 * @file src/components/admin/task-manager/reference/TaskBoardCard.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Показывает карточку доски с доступной сменой статуса и действиями задачи.
 */

import { CalendarDays, Flag, ListTree, MessageSquare } from "lucide-react";
import { UiBadge, UiButton, UiSelect } from "@realize/ui-kit";
import type { TaskRowProps } from "./TaskWorkbench.types";
import type { TaskStatus } from "./taskManager.types";
import { taskPriorities, taskStatuses } from "./taskManager.fixtures";
import { TaskParticipants, TaskRunBadge } from "./TaskParticipants.component";
import { TaskRowActions } from "./TaskRowActions.component";
import styles from "./TaskViews.module.css";

export function TaskBoardCard({
  task,
  actors,
  childCount,
  selected,
  onSelect,
  onOpenTask,
  onCreateSubtask,
  dispatch,
}: TaskRowProps) {
  const items = task.checklists.flatMap((list) => list.items);
  return (
    <article
      className={styles.taskCard}
      data-task-id={task.id}
      data-selected={selected}
      draggable={!task.archived}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-realize-task", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className={styles.cardTop}>
        <label>
          <input
            type="checkbox"
            aria-label={`Выбрать ${task.id}`}
            checked={selected}
            onChange={onSelect}
          />
          {task.id}
        </label>
        <span
          data-priority={task.priority}
          title={
            taskPriorities.find((item) => item.value === task.priority)?.label
          }
        >
          <Flag size={15} />
        </span>
      </div>
      <UiButton
        variant="ghost"
        className={styles.cardTitle}
        onClick={() => onOpenTask(task.id)}
      >
        {task.title}
      </UiButton>
      <div className={styles.cardTags}>
        {task.tags.map((tag) => (
          <UiBadge key={tag}>{tag}</UiBadge>
        ))}
      </div>
      <div className={styles.cardMeta}>
        <span>
          <CalendarDays size={14} />
          {task.dueDate
            ? new Intl.DateTimeFormat("ru", {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              }).format(new Date(`${task.dueDate}T12:00:00Z`))
            : "Без срока"}
        </span>
        <TaskParticipants
          ids={[...task.roles.executor, ...task.coexecutorIds]}
          actors={actors}
        />
      </div>
      <div className={styles.cardMeta}>
        <span>
          <ListTree size={14} />
          {childCount} подзадач
        </span>
        <span>
          <MessageSquare size={14} />
          {task.conversationIds.length}
        </span>
      </div>
      {items.length > 0 && (
        <div className={styles.cardProgress}>
          <progress
            aria-label={`Чеклисты ${task.id}`}
            value={items.filter((item) => item.done).length}
            max={items.length}
          />
          <small>
            {items.filter((item) => item.done).length}/{items.length}
          </small>
        </div>
      )}
      <UiSelect
        aria-label={`Статус ${task.id}`}
        value={task.status}
        disabled={task.archived}
        onChange={(event) =>
          dispatch({
            type: "task/status",
            taskId: task.id,
            status: event.target.value as TaskStatus,
          })
        }
      >
        {taskStatuses.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </UiSelect>
      <div className={styles.cardFooter}>
        <TaskRunBadge state={task.run.state} />
        <TaskRowActions
          task={task}
          dispatch={dispatch}
          onCreateSubtask={onCreateSubtask}
        />
      </div>
    </article>
  );
}
