/**
 * @file src/components/admin/task-manager/reference/TaskViewToolbar.component.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Настраивает поиск, фильтры, сортировку и видимые колонки задач.
 */

import { useState } from "react";
import { Columns3, Search, SlidersHorizontal } from "lucide-react";
import { UiButton, UiDialog, UiInput, UiSelect } from "@realize/ui-kit";
import { taskPriorities, taskStatuses } from "./taskManager.fixtures";
import {
  defaultTaskFilters,
  taskColumnOptions,
} from "./taskWorkbench.constants";
import type { TaskFilters, TaskViewToolbarProps } from "./TaskWorkbench.types";
import styles from "./TaskManagerWorkbench.module.css";

export function TaskViewToolbar({
  allowColumns,
  filters,
  setFilters,
  actors,
  count,
  columns,
  setColumns,
  theme,
}: TaskViewToolbarProps) {
  const [expanded, setExpanded] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const change = (key: keyof TaskFilters, value: string) =>
    setFilters({ ...filters, [key]: value });
  return (
    <>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} />
          <UiInput
            aria-label="Поиск задач"
            placeholder="Найти задачу…"
            value={filters.query}
            onChange={(event) => change("query", event.target.value)}
          />
        </label>
        <UiButton
          variant="ghost"
          size="small"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={16} />
          Фильтры
          {[filters.priority, filters.status, filters.actor].some(
            (value) => value !== "all",
          ) && " •"}
        </UiButton>
        <UiSelect
          className={styles.sort}
          aria-label="Сортировка задач"
          value={filters.sort}
          onChange={(event) => change("sort", event.target.value)}
        >
          <option value="default">По порядку</option>
          <option value="due">По сроку</option>
          <option value="priority">По приоритету</option>
          <option value="title">По названию</option>
        </UiSelect>
        {allowColumns && (
          <UiButton
            variant="ghost"
            size="small"
            onClick={() => setFieldsOpen(true)}
          >
            <Columns3 size={16} />
            Колонки
          </UiButton>
        )}
        <span className={styles.visibleCount}>{count} задач</span>
      </div>
      {expanded && (
        <div className={styles.filters}>
          <label>
            Статус
            <UiSelect
              value={filters.status}
              onChange={(event) => change("status", event.target.value)}
            >
              <option value="all">Все статусы</option>
              {taskStatuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </UiSelect>
          </label>
          <label>
            Приоритет
            <UiSelect
              value={filters.priority}
              onChange={(event) => change("priority", event.target.value)}
            >
              <option value="all">Любой приоритет</option>
              {taskPriorities.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </UiSelect>
          </label>
          <label>
            Исполнитель
            <UiSelect
              value={filters.actor}
              onChange={(event) => change("actor", event.target.value)}
            >
              <option value="all">Люди и агенты</option>
              <option value="human">Все люди</option>
              <option value="agent">Все AI агенты</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </UiSelect>
          </label>
          <UiButton
            variant="ghost"
            size="small"
            onClick={() => setFilters(defaultTaskFilters)}
          >
            Сбросить
          </UiButton>
        </div>
      )}
      <UiDialog
        open={fieldsOpen}
        onOpenChange={setFieldsOpen}
        title="Колонки представления"
        description="Настройка применяется к списку и таблице."
        mode={theme}
      >
        <div className={styles.columnOptions}>
          {taskColumnOptions.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={columns.includes(item.id)}
                onChange={(event) =>
                  setColumns(
                    event.target.checked
                      ? [...columns, item.id]
                      : columns.filter((id) => id !== item.id),
                  )
                }
              />
              {item.label}
            </label>
          ))}
        </div>
      </UiDialog>
    </>
  );
}
