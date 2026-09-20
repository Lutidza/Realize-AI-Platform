/**
 * @file src/components/admin/task-manager/reference/TaskDetailOverview.component.tsx
 * @version 2.0.0
 * @date 2026-09-17
 * @description Показывает поля задачи, роли, подзадачи и прогресс критериев и чеклистов.
 * @see documentation/specifications/task-management.md
 */

import { UiBadge, UiButton, UiInput, UiSelect } from "@realize/ui-kit";
import {
  ArrowRight,
  CalendarDays,
  CheckCheck,
  CircleCheck,
  Flag,
  ListChecks,
  Plus,
  Users,
} from "lucide-react";
import {
  roleLabels,
  taskPriorities,
  taskStatuses,
} from "./taskManager.fixtures";
import type { PrototypeTask, TaskRole, TaskStatus } from "./taskManager.types";
import type { TaskDetailOverviewProps } from "./TaskDetail.types";
import { TaskPeoplePicker } from "./TaskPeoplePicker.component";
import styles from "./TaskDetailDrawer.module.css";

/** Мгновенные изменения проходят guards модели; составные изменения открывают полный draft. */
export function TaskDetailOverview({
  task,
  actors,
  state,
  dispatch,
  onOpenTask,
  onCreateSubtask,
  onEdit,
}: TaskDetailOverviewProps) {
  const children = state.tasks.filter(
    (child) => child.parentId === task.id && !child.archived,
  );
  const parent = state.tasks.find((item) => item.id === task.parentId);
  const completedCriteria = task.criteria.filter((item) => item.done).length;
  return (
    <div className={styles.overview}>
      <div className={styles.fields}>
        <label>
          <span>
            <CircleCheck size={15} /> Статус задачи
          </span>
          <UiSelect
            aria-label="Статус задачи"
            disabled={task.archived}
            value={task.status}
            onChange={(event) =>
              dispatch({
                type: "task/status",
                taskId: task.id,
                status: event.target.value as TaskStatus,
              })
            }
          >
            {taskStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </UiSelect>
        </label>
        <label>
          <span>
            <Flag size={15} /> Приоритет
          </span>
          <UiSelect
            aria-label="Приоритет"
            disabled={task.archived}
            value={task.priority}
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
            {taskPriorities.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </UiSelect>
        </label>
        <label>
          <span>
            <CalendarDays size={15} /> Дата начала
          </span>
          <UiInput
            disabled={task.archived}
            type="date"
            value={task.startDate}
            onChange={(event) =>
              dispatch({
                type: "task/update",
                taskId: task.id,
                patch: { startDate: event.target.value },
              })
            }
          />
        </label>
        <label>
          <span>
            <CalendarDays size={15} /> Срок
          </span>
          <UiInput
            disabled={task.archived}
            type="date"
            value={task.dueDate}
            onChange={(event) =>
              dispatch({
                type: "task/update",
                taskId: task.id,
                patch: { dueDate: event.target.value },
              })
            }
          />
        </label>
        <div className={styles.fieldSummary}>
          <span>Оценка времени</span>
          <strong>
            {task.estimateMinutes === null
              ? "Не задана"
              : `${task.estimateMinutes} мин`}
          </strong>
        </div>
        <div className={styles.fieldSummary}>
          <span>
            <ListChecks size={15} /> Критерии
          </span>
          <strong>
            {completedCriteria} из {task.criteria.length} выполнено
          </strong>
        </div>
      </div>
      {parent && (
        <div className={styles.section}>
          <h3>Родительская задача</h3>
          <UiButton
            variant="ghost"
            className={styles.linkButton}
            onClick={() => onOpenTask(parent.id)}
          >
            <span className={styles.muted}>{parent.id}</span> {parent.title}{" "}
            <ArrowRight size={14} />
          </UiButton>
        </div>
      )}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>
            <Users size={16} /> Участники
          </h3>
          <UiButton
            variant="ghost"
            size="small"
            onClick={() => onEdit("people")}
            disabled={task.archived}
          >
            Настроить
          </UiButton>
        </div>
        <div className={styles.participantGrid}>
          {(Object.keys(roleLabels) as TaskRole[]).map((role) => (
            <div className={styles.roleField} key={role}>
              <span>{roleLabels[role]}</span>
              {task.archived ? (
                <span>
                  {actors
                    .filter((actor) => task.roles[role].includes(actor.id))
                    .map((actor) => actor.name)
                    .join(", ") || "Не назначены"}
                </span>
              ) : (
                <TaskPeoplePicker
                  label={`Изменить роль: ${roleLabels[role]}`}
                  actors={actors}
                  value={task.roles[role]}
                  onChange={(actorIds) =>
                    dispatch({
                      type: "task/role",
                      taskId: task.id,
                      role,
                      actorIds,
                    })
                  }
                />
              )}
            </div>
          ))}
        </div>
        <p className={styles.muted}>
          Соисполнители:{" "}
          {actors
            .filter((actor) => task.coexecutorIds.includes(actor.id))
            .map((actor) => actor.name)
            .join(", ") || "Не назначены"}
        </p>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Описание</h3>
          <UiButton
            variant="ghost"
            size="small"
            onClick={() => onEdit()}
            disabled={task.archived}
          >
            Редактировать
          </UiButton>
        </div>
        <p className={styles.description}>
          {task.description || "Описание пока не добавлено."}
        </p>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>
            Подзадачи{" "}
            <span className={styles.muted}>
              {children.filter((child) => child.status === "done").length}/
              {children.length}
            </span>
          </h3>
          <UiButton
            variant="secondary"
            size="small"
            disabled={task.archived || task.status === "done"}
            onClick={() => onCreateSubtask(task.id)}
          >
            <Plus size={15} /> Подзадача
          </UiButton>
        </div>
        {!children.length && (
          <p className={styles.muted}>
            Разбейте крупную задачу на отдельные результаты.
          </p>
        )}
        {children.map((child) => (
          <div key={child.id} className={styles.childRow}>
            <UiButton
              variant="ghost"
              className={styles.linkButton}
              onClick={() => onOpenTask(child.id)}
            >
              <span className={styles.muted}>{child.id}</span>
              <span>{child.title}</span>
              <ArrowRight size={14} />
            </UiButton>
            <UiBadge>
              {
                taskStatuses.find((status) => status.value === child.status)
                  ?.label
              }
            </UiBadge>
          </div>
        ))}
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>
            <CheckCheck size={16} /> Критерии приёмки
          </h3>
          <UiButton
            size="small"
            variant="ghost"
            onClick={() => onEdit("checklists")}
            disabled={task.archived}
          >
            Изменить
          </UiButton>
        </div>
        <progress
          className={styles.progress}
          value={completedCriteria}
          max={task.criteria.length || 1}
          aria-label="Выполнение критериев"
        />
        {!task.criteria.length && (
          <p className={styles.muted}>Критерии ещё не заданы.</p>
        )}
        {task.criteria.map((item) => (
          <label className={styles.criterion} key={item.id}>
            <input
              type="checkbox"
              checked={item.done}
              disabled={task.archived || task.status === "done"}
              onChange={() =>
                dispatch({
                  type: "task/criterion-toggle",
                  taskId: task.id,
                  itemId: item.id,
                })
              }
            />
            <span data-done={item.done}>{item.title}</span>
          </label>
        ))}
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>
            <ListChecks size={16} /> Рабочие чеклисты
          </h3>
          <UiButton
            size="small"
            variant="secondary"
            onClick={() => onEdit("checklists")}
            disabled={task.archived}
          >
            <Plus size={15} /> Чеклист
          </UiButton>
        </div>
        {!task.checklists.length && (
          <p className={styles.muted}>
            Добавьте шаги работы, сроки и ответственных.
          </p>
        )}
        {task.checklists.map((list) => (
          <article className={styles.workChecklist} key={list.id}>
            <div className={styles.sectionHeader}>
              <strong>{list.title}</strong>
              <span className={styles.muted}>
                {list.items.filter((item) => item.done).length}/
                {list.items.length}
              </span>
            </div>
            <progress
              className={styles.progress}
              value={list.items.filter((item) => item.done).length}
              max={list.items.length || 1}
              aria-label={`Прогресс: ${list.title}`}
            />
            {list.items.map((item) => (
              <div className={styles.workItem} key={item.id}>
                <label className={styles.criterion}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={task.archived || task.status === "done"}
                    onChange={(event) =>
                      dispatch({
                        type: "task/checklists",
                        taskId: task.id,
                        checklists: task.checklists.map((checklist) =>
                          checklist.id !== list.id
                            ? checklist
                            : {
                                ...checklist,
                                items: checklist.items.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, done: event.target.checked }
                                    : entry,
                                ),
                              },
                        ),
                      })
                    }
                  />
                  <span data-done={item.done}>{item.title}</span>
                </label>
                <div className={styles.workItemMeta}>
                  {item.required && <UiBadge>Обязательный</UiBadge>}
                  {item.assigneeId && (
                    <span>
                      {
                        actors.find((actor) => actor.id === item.assigneeId)
                          ?.name
                      }
                    </span>
                  )}
                  {item.dueDate && <time>{item.dueDate}</time>}
                </div>
              </div>
            ))}
          </article>
        ))}
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Настройки исполнения</h3>
          <UiButton
            variant="ghost"
            size="small"
            disabled={task.archived}
            onClick={() => onEdit()}
          >
            Настроить
          </UiButton>
        </div>
        <dl className={styles.bindings}>
          <div>
            <dt>Workflow</dt>
            <dd>{task.workflow || "Не задан"}</dd>
          </div>
          <div>
            <dt>Профиль</dt>
            <dd>{task.profile || "Не задан"}</dd>
          </div>
          <div>
            <dt>Режим</dt>
            <dd>
              {
                {
                  manual: "Ручной",
                  staged: "По этапам",
                  automatic: "Автоматический",
                }[task.mode]
              }
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
