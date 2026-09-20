/**
 * @file src/components/admin/task-manager/reference/TaskTableRow.component.tsx
 * @version 1.1.0
 * @date 2026-09-18
 * @description Отображает строку задачи с контролируемыми полями и действиями.
 */

import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  GitBranch,
  ListChecks,
  ListTree,
} from "lucide-react";
import { UiButton, UiInput, UiSelect } from "@realize/ui-kit";
import { taskPriorities, taskStatuses } from "./taskManager.fixtures";
import type { PrototypeTask, TaskStatus } from "./taskManager.types";
import type { TaskRowProps } from "./TaskWorkbench.types";
import { TaskParticipants, TaskRunBadge } from "./TaskParticipants.component";
import { TaskRowActions } from "./TaskRowActions.component";
import styles from "./TaskViews.module.css";

export function TaskTableRow({
  task,
  actors,
  columns,
  selected,
  onSelect,
  onOpenTask,
  childCount,
  onCreateSubtask,
  dispatch,
  tree,
}: TaskRowProps) {
  const items = task.checklists.flatMap((list) => list.items);
  return (
    <tr
      data-task-id={task.id}
      data-selected={selected}
      data-depth={tree?.depth}
      data-context={tree?.contextOnly}
    >
      <td className={styles.selectionCell}>
        <input
          type="checkbox"
          aria-label={`Выбрать ${task.id}`}
          checked={selected}
          disabled={tree?.contextOnly}
          title={
            tree?.contextOnly
              ? "Родитель показан для контекста поиска"
              : undefined
          }
          onChange={onSelect}
        />
      </td>
      <td className={styles.nameCell}>
        <div
          className={styles.taskNameRow}
          style={{
            paddingInlineStart: `${Math.min(tree?.depth ?? 0, 6) * 18}px`,
          }}
        >
          {tree &&
            (childCount > 0 ? (
              <UiButton
                variant="ghost"
                size="icon"
                className={styles.treeToggle}
                aria-label={`${tree.expanded ? "Свернуть" : "Развернуть"} подзадачи ${task.id}`}
                aria-expanded={tree.expanded}
                onClick={tree.onToggle}
                disabled={!tree.onToggle}
              >
                {tree.expanded ? (
                  <ChevronDown size={15} />
                ) : (
                  <ChevronRight size={15} />
                )}
              </UiButton>
            ) : (
              <span className={styles.treeSpacer} aria-hidden="true" />
            ))}
          <UiButton
            variant="ghost"
            className={styles.taskTitle}
            onClick={() => onOpenTask(task.id)}
          >
            {task.parentId && !tree && (
              <CornerDownRight
                size={16}
                aria-label={`Подзадача ${task.parentId}`}
              />
            )}
            <span>
              {task.title}
              <small>
                {task.id}
                {tree?.contextOnly ? " · Контекст" : ""}
                {task.tags.length ? ` · ${task.tags.join(" · ")}` : ""}
              </small>
            </span>
            {childCount > 0 && (
              <span
                className={styles.childCount}
                title={`${childCount} подзадач`}
              >
                <ListTree size={14} />
                {childCount}
              </span>
            )}
            {task.dependsOn.length > 0 && (
              <GitBranch size={15} aria-label="Есть зависимости" />
            )}
            {items.length > 0 && (
              <span
                className={styles.childCount}
                title={`Чеклисты: ${items.filter((item) => item.done).length} из ${items.length}`}
                aria-label={`Чеклисты: ${items.filter((item) => item.done).length} из ${items.length}`}
              >
                <ListChecks size={14} aria-hidden="true" />
                {items.filter((item) => item.done).length}/{items.length}
              </span>
            )}
          </UiButton>
        </div>
      </td>
      <td>
        <UiSelect
          aria-label={`Статус ${task.id}`}
          className={styles.inlineStatus}
          value={task.status}
          disabled={task.archived || tree?.contextOnly}
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
      </td>
      {columns.includes("people") && (
        <td>
          <TaskParticipants
            actors={actors}
            ids={[...task.roles.executor, ...task.coexecutorIds]}
          />
        </td>
      )}
      {columns.includes("due") && (
        <td>
          <UiInput
            type="date"
            className={styles.inlineDate}
            aria-label={`Срок ${task.id}`}
            value={task.dueDate}
            disabled={task.archived || tree?.contextOnly}
            onChange={(event) =>
              dispatch({
                type: "task/update",
                taskId: task.id,
                patch: { dueDate: event.target.value },
              })
            }
          />
        </td>
      )}
      {columns.includes("priority") && (
        <td>
          <UiSelect
            aria-label={`Приоритет ${task.id}`}
            className={styles.inlinePriority}
            value={task.priority}
            disabled={task.archived || tree?.contextOnly}
            onChange={(event) =>
              dispatch({
                type: "task/update",
                taskId: task.id,
                patch: {
                  priority: event.target.value as PrototypeTask["priority"],
                },
              })
            }
          >
            {taskPriorities.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </UiSelect>
        </td>
      )}
      {columns.includes("progress") && (
        <td className={styles.progressCell}>
          {items.length ? (
            <>
              <progress
                aria-label={`Чеклисты ${task.id}`}
                value={items.filter((item) => item.done).length}
                max={items.length}
              />
              <small>
                {items.filter((item) => item.done).length}/{items.length}
              </small>
            </>
          ) : (
            "—"
          )}
        </td>
      )}
      {columns.includes("run") && (
        <td>
          <TaskRunBadge state={task.run.state} />
        </td>
      )}
      <td>
        {!tree?.contextOnly && (
          <TaskRowActions
            task={task}
            dispatch={dispatch}
            onCreateSubtask={onCreateSubtask}
          />
        )}
      </td>
    </tr>
  );
}
