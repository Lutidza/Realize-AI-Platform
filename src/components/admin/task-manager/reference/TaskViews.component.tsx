/**
 * @file src/components/admin/task-manager/reference/TaskViews.component.tsx
 * @version 2.1.0
 * @date 2026-09-18
 * @description Синхронизирует список, таблицу и доску через общие команды и пакетные операции.
 * @see documentation/specifications/task-management.md
 */

import { useState } from "react";
import {
  Archive,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
} from "lucide-react";
import { UiButton, UiSelect } from "@realize/ui-kit";
import { taskStatuses } from "./taskManager.fixtures";
import { taskColumnOptions } from "./taskWorkbench.constants";
import type { TaskStatus } from "./taskManager.types";
import type { TaskViewsProps } from "./TaskWorkbench.types";
import { TaskBoardCard } from "./TaskBoardCard.component";
import { TaskTableRow } from "./TaskTableRow.component";
import { useTaskTree } from "./useTaskTree.hook";
import styles from "./TaskViews.module.css";

export function TaskViews({
  tasks,
  allTasks,
  actors,
  view,
  columns,
  selected,
  onSelect,
  onOpenTask,
  onCreate,
  onCreateSubtask,
  dispatch,
  filtered = false,
  createLabel = "Создать задачу",
}: TaskViewsProps) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const tree = useTaskTree(tasks, allTasks, filtered);
  const nested = tree.nested && view !== "board";
  const selectedIds = selected.filter((id) =>
    tasks.some((task) => task.id === id),
  );
  const groups =
    view === "table" ? [{ value: "all", label: "Все задачи" }] : taskStatuses;
  const toggle = (id: string) =>
    onSelect(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  return (
    <div className={styles.views}>
      {view !== "board" && (
        <div className={styles.treeToolbar}>
          <label>
            Подзадачи
            <UiSelect
              aria-label="Отображение подзадач"
              value={tree.nested ? "nested" : "flat"}
              onChange={(event) =>
                tree.setNested(event.target.value === "nested")
              }
            >
              <option value="nested">Вложенные</option>
              <option value="flat">Отдельными строками</option>
            </UiSelect>
          </label>
          {nested && (
            <span>
              {filtered
                ? "Родители показаны для контекста поиска"
                : "Раскройте задачу, чтобы увидеть подзадачи"}
            </span>
          )}
        </div>
      )}
      {selectedIds.length > 0 && (
        <div
          className={styles.bulkBar}
          role="region"
          aria-label="Действия с выбранными задачами"
        >
          <CheckSquare size={17} />
          <strong>Выбрано: {selectedIds.length}</strong>
          <UiSelect
            aria-label="Статус выбранных задач"
            value=""
            onChange={(event) => {
              const result = dispatch({
                type: "task/bulk",
                taskIds: selectedIds,
                operation: "status",
                status: event.target.value as TaskStatus,
              });
              if (result.ok) onSelect([]);
            }}
          >
            <option value="" disabled>
              Изменить статус
            </option>
            {taskStatuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </UiSelect>
          <UiButton
            variant="secondary"
            size="small"
            onClick={() => {
              const result = dispatch({
                type: "task/bulk",
                taskIds: selectedIds,
                operation: tasks.every((task) => task.archived)
                  ? "restore"
                  : "archive",
              });
              if (result.ok) onSelect([]);
            }}
          >
            <Archive size={15} />
            {tasks.every((task) => task.archived) ? "Восстановить" : "В архив"}
          </UiButton>
          <UiButton
            variant="ghost"
            size="icon"
            aria-label="Снять выделение"
            onClick={() => onSelect([])}
          >
            <X size={16} />
          </UiButton>
        </div>
      )}
      {!tasks.length ? (
        <div className={styles.empty}>
          <CheckSquare size={32} />
          <h3>
            {createLabel === "Создать проект"
              ? "Добавьте проект"
              : createLabel === "Создать список"
                ? "Добавьте список задач"
                : "Задач пока нет"}
          </h3>
          <p>
            {createLabel === "Создать проект"
              ? "Объедините задачи команды в проекте. Первый список появится автоматически."
              : createLabel === "Создать список"
                ? "Создайте список в этой папке, чтобы добавлять задачи."
                : "Измените фильтры или создайте первую задачу."}
          </p>
          <UiButton onClick={() => onCreate()}>
            <Plus size={16} />
            {createLabel}
          </UiButton>
        </div>
      ) : (
        <div
          className={view === "board" ? styles.board : styles.taskGroups}
          aria-label={
            view === "board"
              ? "Доска задач"
              : view === "table"
                ? "Таблица задач"
                : "Список задач"
          }
        >
          {groups.map(({ value, label }) => {
            const rows = nested
              ? tree.rows.filter(
                  (row) => value === "all" || row.rootStatus === value,
                )
              : tasks
                  .filter((task) => value === "all" || task.status === value)
                  .map((task) => ({
                    task,
                    depth: 0,
                    contextOnly: false,
                    childCount: 0,
                    expanded: false,
                  }));
            const group = rows
              .filter((row) => !row.contextOnly)
              .map((row) => row.task);
            if (view !== "board" && !rows.length) return null;
            const isCollapsed =
              collapsed.includes(value) && view !== "board" && !filtered;
            return (
              <section
                key={value}
                className={
                  view === "board" ? styles.boardColumn : styles.taskGroup
                }
                data-status={value}
                onDragOver={
                  view === "board"
                    ? (event) => {
                        if (
                          event.dataTransfer.types.includes(
                            "application/x-realize-task",
                          )
                        )
                          event.preventDefault();
                      }
                    : undefined
                }
                onDrop={
                  view === "board"
                    ? (event) => {
                        event.preventDefault();
                        const taskId = event.dataTransfer.getData(
                          "application/x-realize-task",
                        );
                        if (tasks.some((task) => task.id === taskId))
                          dispatch({
                            type: "task/status",
                            taskId,
                            status: value as TaskStatus,
                          });
                      }
                    : undefined
                }
              >
                <div className={styles.groupHeading}>
                  {view !== "board" && (
                    <UiButton
                      variant="ghost"
                      size="icon"
                      aria-label={`${isCollapsed ? "Развернуть" : "Свернуть"} ${label}`}
                      aria-expanded={!isCollapsed}
                      disabled={filtered}
                      onClick={() =>
                        setCollapsed(
                          isCollapsed
                            ? collapsed.filter((item) => item !== value)
                            : [...collapsed, value],
                        )
                      }
                    >
                      {isCollapsed ? (
                        <ChevronRight size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </UiButton>
                  )}
                  <h2>
                    <span className={styles.statusDot} />
                    {label}
                  </h2>
                  <span className={styles.count}>{group.length}</span>
                  {(value === "backlog" ||
                    value === "ready" ||
                    value === "all") && (
                    <UiButton
                      variant="ghost"
                      size="icon"
                      aria-label={`Добавить задачу · ${label}`}
                      onClick={() =>
                        onCreate(value === "ready" ? "ready" : "backlog")
                      }
                    >
                      <Plus size={17} />
                    </UiButton>
                  )}
                </div>
                {!isCollapsed &&
                  (view === "board" ? (
                    <div className={styles.boardCards}>
                      {group.map((task) => (
                        <TaskBoardCard
                          key={task.id}
                          task={task}
                          actors={actors}
                          columns={columns}
                          selected={selected.includes(task.id)}
                          onSelect={() => toggle(task.id)}
                          onOpenTask={onOpenTask}
                          onCreateSubtask={onCreateSubtask}
                          dispatch={dispatch}
                          childCount={
                            allTasks.filter(
                              (child) =>
                                child.parentId === task.id && !child.archived,
                            ).length
                          }
                        />
                      ))}
                      {!group.length && (
                        <p className={styles.groupEmpty}>
                          Переместите задачу в эту колонку
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className={styles.tableScroll}>
                      <table className={styles.taskTable}>
                        <thead>
                          <tr>
                            <th className={styles.selectionCell}>
                              <input
                                type="checkbox"
                                aria-label={`Выбрать все · ${label}`}
                                checked={
                                  group.length > 0 &&
                                  group.every((task) =>
                                    selected.includes(task.id),
                                  )
                                }
                                disabled={!group.length}
                                onChange={(event) =>
                                  onSelect(
                                    event.target.checked
                                      ? [
                                          ...new Set([
                                            ...selected,
                                            ...group.map((task) => task.id),
                                          ]),
                                        ]
                                      : selected.filter(
                                          (id) =>
                                            !group.some(
                                              (task) => task.id === id,
                                            ),
                                        ),
                                  )
                                }
                              />
                            </th>
                            <th>Название задачи</th>
                            <th>Статус</th>
                            {taskColumnOptions
                              .filter((item) => columns.includes(item.id))
                              .map((item) => (
                                <th key={item.id}>{item.label}</th>
                              ))}
                            <th>
                              <span className={styles.srOnly}>Действия</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(
                            ({
                              task,
                              depth,
                              contextOnly,
                              childCount,
                              expanded,
                            }) => (
                              <TaskTableRow
                                key={task.id}
                                task={task}
                                actors={actors}
                                columns={columns}
                                selected={selected.includes(task.id)}
                                onSelect={() => toggle(task.id)}
                                onOpenTask={onOpenTask}
                                onCreateSubtask={onCreateSubtask}
                                dispatch={dispatch}
                                tree={
                                  nested
                                    ? {
                                        depth,
                                        contextOnly,
                                        expanded,
                                        onToggle:
                                          childCount > 0 && !filtered
                                            ? () => tree.toggle(task.id)
                                            : undefined,
                                      }
                                    : undefined
                                }
                                childCount={
                                  nested
                                    ? childCount
                                    : allTasks.filter(
                                        (child) =>
                                          child.parentId === task.id &&
                                          !child.archived,
                                      ).length
                                }
                              />
                            ),
                          )}
                        </tbody>
                      </table>
                      {!group.length && (
                        <p className={styles.groupEmpty}>Пока нет задач</p>
                      )}
                    </div>
                  ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
