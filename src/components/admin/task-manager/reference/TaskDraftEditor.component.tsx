/**
 * @file src/components/admin/task-manager/reference/TaskDraftEditor.component.tsx
 * @version 2.1.0
 * @date 2026-09-19
 * @description Собирает единый полный редактор создания и изменения задачи.
 * @see documentation/specifications/task-management.md
 */

import { useState } from "react";
import {
  UiButton,
  UiInput,
  UiSelect,
  UiTabs,
  UiTextarea,
} from "@realize/ui-kit";
import {
  ChevronDown,
  ChevronUp,
  GitBranch,
  Link2,
  ListChecks,
  Settings2,
  Users,
} from "lucide-react";
import type { TaskDraftEditorProps } from "./TaskComposer.types";
import type { TaskDraft, TaskRole } from "./taskManager.types";
import {
  taskPriorities,
  taskStatuses,
  roleLabels,
} from "./taskManager.fixtures";
import { taskTypeLabels } from "./taskComposer.constants";
import { TaskPeoplePicker } from "./TaskPeoplePicker.component";
import { TaskCriteriaEditor } from "./TaskCriteriaEditor.component";
import { TaskChecklistEditor } from "./TaskChecklistEditor.component";
import { TaskGitLinksEditor } from "./TaskGitLinksEditor.component";
import { TaskDraftRelations } from "./TaskDraftRelations.component";
import { getLocationPath } from "./taskManager.hierarchy";
import styles from "./TaskDraftEditor.module.css";

/** Все вкладки пишут в один внешний draft; переключение не сохраняет частичную задачу. */
export function TaskDraftEditor(props: TaskDraftEditorProps) {
  const { draft, taskId, actors, hierarchy, tasks, fieldErrors, onChange } =
    props;
  const { projects, lists } = hierarchy;
  const [expanded, setExpanded] = useState(!props.compact);
  const [tab, setTab] = useState<string>(props.initialTab ?? "details");
  const patch = (value: Partial<TaskDraft>) => onChange({ ...draft, ...value });
  const fieldError = (name: string) =>
    fieldErrors[name] ? (
      <small className={styles.error}>{fieldErrors[name]}</small>
    ) : null;
  const parents = tasks.filter(
    (task) =>
      task.id !== taskId &&
      task.projectId === draft.projectId &&
      task.listId === draft.listId &&
      !task.archived,
  );
  const projectLists = lists.filter(
    (list) => list.projectId === draft.projectId,
  );
  const selectedList = projectLists.find((list) => list.id === draft.listId);
  const locationPath = selectedList
    ? getLocationPath(hierarchy, { kind: "list", id: selectedList.id })
    : getLocationPath(hierarchy, { kind: "project", id: draft.projectId });
  const descriptionField = (
    <label className={styles.field}>
      <span>Описание</span>
      <UiTextarea
        aria-label="Описание задачи"
        rows={4}
        value={draft.description}
        onChange={(event) => patch({ description: event.target.value })}
        placeholder="Контекст, ожидаемый результат и ограничения…"
      />
    </label>
  );
  const basicFields = (
    <div className={styles.threeColumns}>
      <label className={styles.field}>
        <span>Тип задачи</span>
        <UiSelect
          aria-label="Тип задачи"
          value={draft.taskType}
          onChange={(event) =>
            patch({ taskType: event.target.value as TaskDraft["taskType"] })
          }
        >
          {Object.entries(taskTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </UiSelect>
        {fieldError("taskType")}
      </label>
      <label className={styles.field}>
        <span>Статус</span>
        <UiSelect
          aria-label="Статус задачи"
          value={draft.status}
          onChange={(event) =>
            patch({ status: event.target.value as TaskDraft["status"] })
          }
        >
          {taskStatuses
            .filter(
              (status) =>
                Boolean(taskId) || ["backlog", "ready"].includes(status.value),
            )
            .map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
        </UiSelect>
        {fieldError("status")}
      </label>
      <label className={styles.field}>
        <span>Приоритет</span>
        <UiSelect
          aria-label="Приоритет"
          value={draft.priority}
          onChange={(event) =>
            patch({ priority: event.target.value as TaskDraft["priority"] })
          }
        >
          {taskPriorities.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </UiSelect>
        {fieldError("priority")}
      </label>
    </div>
  );
  const details = (
    <div className={styles.stack}>
      {descriptionField}
      {basicFields}
      <div className={styles.threeColumns}>
        <label className={styles.field}>
          <span>Дата начала</span>
          <UiInput
            type="date"
            value={draft.startDate}
            onChange={(event) => patch({ startDate: event.target.value })}
            aria-invalid={Boolean(fieldErrors.startDate)}
          />
          {fieldError("startDate")}
        </label>
        <label className={styles.field}>
          <span>Срок</span>
          <UiInput
            type="date"
            value={draft.dueDate}
            onChange={(event) => patch({ dueDate: event.target.value })}
            aria-invalid={Boolean(fieldErrors.dueDate)}
          />
          {fieldError("dueDate")}
        </label>
        <label className={styles.field}>
          <span>Оценка, минут</span>
          <UiInput
            type="number"
            min={0}
            step={1}
            value={draft.estimateMinutes ?? ""}
            placeholder="Не задана"
            onChange={(event) =>
              patch({
                estimateMinutes:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
            aria-invalid={Boolean(fieldErrors.estimateMinutes)}
          />
          {fieldError("estimateMinutes")}
        </label>
      </div>
      <div className={styles.twoColumns}>
        <label className={styles.field}>
          <span>Родительская задача</span>
          <UiSelect
            aria-label="Родительская задача"
            value={draft.parentId ?? ""}
            aria-invalid={Boolean(fieldErrors.parentId)}
            onChange={(event) =>
              patch({ parentId: event.target.value || null })
            }
          >
            <option value="">Без родителя</option>
            {draft.parentId &&
              !parents.some((parent) => parent.id === draft.parentId) && (
                <option value={draft.parentId}>
                  Недоступная родительская задача · {draft.parentId}
                </option>
              )}
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.id} · {parent.title}
              </option>
            ))}
          </UiSelect>
          {fieldError("parentId")}
          <small className={styles.fieldHint}>
            Родитель и подзадача находятся в одном списке.
          </small>
        </label>
        <label className={styles.field}>
          <span>Метки через запятую</span>
          <UiInput
            value={draft.tags.join(",")}
            onChange={(event) => patch({ tags: event.target.value.split(",") })}
            placeholder="frontend, reference, UX"
          />
        </label>
      </div>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <h3>Настройки исполнения</h3>
            <p>Контекст будущего запуска людей и агентов.</p>
          </div>
        </div>
        <div className={styles.twoColumns}>
          <label className={styles.field}>
            <span>Workflow</span>
            <UiInput
              value={draft.workflow}
              onChange={(event) => patch({ workflow: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>Профиль</span>
            <UiInput
              value={draft.profile}
              onChange={(event) => patch({ profile: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>Режим выполнения</span>
            <UiSelect
              aria-label="Режим выполнения"
              value={draft.mode}
              onChange={(event) =>
                patch({ mode: event.target.value as TaskDraft["mode"] })
              }
            >
              <option value="manual">Ручной</option>
              <option value="staged">По этапам</option>
              <option value="automatic">Автоматический</option>
            </UiSelect>
          </label>
        </div>
      </section>
    </div>
  );
  const people = (
    <div className={styles.stack}>
      <p className={styles.callout}>
        На каждую роль можно назначить нескольких людей и AI-агентов. Передача
        ответственности и делегирование доступны в карточке после создания.
      </p>
      <div className={styles.twoColumns}>
        {(Object.keys(roleLabels) as TaskRole[]).map((role) => (
          <div className={styles.field} key={role}>
            <span>{roleLabels[role]}</span>
            <TaskPeoplePicker
              label={roleLabels[role]}
              actors={actors}
              value={draft.roles[role]}
              onChange={(ids) =>
                patch({ roles: { ...draft.roles, [role]: ids } })
              }
            />
            {fieldError(`roles.${role}`)}
          </div>
        ))}
        <div className={`${styles.field} ${styles.fullWidth}`}>
          <span>Соисполнители</span>
          <TaskPeoplePicker
            label="Соисполнители"
            actors={actors.filter(
              (actor) => !draft.roles.executor.includes(actor.id),
            )}
            value={draft.coexecutorIds}
            onChange={(ids) => patch({ coexecutorIds: ids })}
          />
          {fieldError("coexecutorIds")}
        </div>
      </div>
    </div>
  );
  return (
    <div className={styles.editor}>
      <div className={styles.taskIdentity}>
        <label className={`${styles.field} ${styles.fullWidth}`}>
          <span>
            Название задачи <span aria-hidden="true">*</span>
          </span>
          <UiInput
            autoFocus
            aria-required="true"
            aria-label="Название задачи"
            value={draft.title}
            maxLength={160}
            placeholder="Что нужно сделать?"
            aria-invalid={Boolean(fieldErrors.title)}
            onChange={(event) => patch({ title: event.target.value })}
          />
          {fieldError("title")}
        </label>
        <label className={styles.field}>
          <span>
            Проект <span aria-hidden="true">*</span>
          </span>
          <UiSelect
            aria-label="Проект"
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.projectId)}
            value={draft.projectId}
            onChange={(event) =>
              patch({
                projectId: event.target.value,
                listId: "",
                parentId: null,
              })
            }
          >
            <option value="">Выберите проект</option>
            {draft.projectId &&
              !projects.some((project) => project.id === draft.projectId) && (
                <option value={draft.projectId}>
                  Недоступный проект · {draft.projectId}
                </option>
              )}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {getLocationPath(hierarchy, { kind: "project", id: project.id })
                  .reverse()
                  .map((part) => part.name)
                  .join(" · ")}
              </option>
            ))}
          </UiSelect>
          {fieldError("projectId")}
        </label>
        <label className={styles.field}>
          <span>
            Список <span aria-hidden="true">*</span>
          </span>
          <UiSelect
            aria-label="Список задач"
            title={locationPath.map((part) => part.name).join(" / ")}
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.listId)}
            value={draft.listId}
            onChange={(event) =>
              patch({
                listId: event.target.value,
                parentId: tasks.some(
                  (task) =>
                    task.id === draft.parentId &&
                    task.listId === event.target.value,
                )
                  ? draft.parentId
                  : null,
              })
            }
          >
            <option value="">Выберите список</option>
            {draft.listId && !selectedList && (
              <option value={draft.listId}>
                Недоступный список · {draft.listId}
              </option>
            )}
            {projectLists.map((list) => (
              <option key={list.id} value={list.id}>
                {getLocationPath(hierarchy, { kind: "list", id: list.id })
                  .reverse()
                  .map((part) => part.name)
                  .join(" · ")}
              </option>
            ))}
          </UiSelect>
          {fieldError("listId")}
          {!projectLists.length && (
            <small className={styles.fieldHint}>
              Создайте список в выбранном проекте через навигацию.
            </small>
          )}
        </label>
        {!props.compact && (
          <p
            className={`${styles.locationContext} ${styles.fullWidth}`}
            aria-label="Расположение задачи"
          >
            {locationPath.length
              ? locationPath.map((part) => part.name).join(" / ")
              : "Выберите расположение задачи"}
            {draft.parentId &&
              parents.find((parent) => parent.id === draft.parentId) && (
                <>
                  {" "}
                  /{" "}
                  {
                    parents.find((parent) => parent.id === draft.parentId)
                      ?.title
                  }
                </>
              )}
          </p>
        )}
      </div>
      {props.compact && !expanded && (
        <div className={styles.stack}>
          {descriptionField}
          {basicFields}
        </div>
      )}
      {props.compact && (
        <UiButton
          variant="ghost"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronUp size={15} aria-hidden="true" />
          ) : (
            <ChevronDown size={15} aria-hidden="true" />
          )}
          {expanded ? "Только основные поля" : "Все поля задачи"}
        </UiButton>
      )}
      {expanded && (
        <UiTabs
          label="Поля задачи"
          value={tab}
          onValueChange={setTab}
          appearance="underline"
          items={[
            {
              id: "details",
              label: "Основное",
              icon: <Settings2 size={15} />,
              content: <div className={styles.tabContent}>{details}</div>,
            },
            {
              id: "people",
              label: "Участники",
              icon: <Users size={15} />,
              content: <div className={styles.tabContent}>{people}</div>,
            },
            {
              id: "checklists",
              label: `Чеклисты${draft.checklists.length ? ` · ${draft.checklists.length}` : ""}`,
              icon: <ListChecks size={15} />,
              content: (
                <div className={styles.tabContent}>
                  <div className={styles.stack}>
                    <TaskCriteriaEditor
                      value={draft.criteria}
                      onChange={(criteria) => patch({ criteria })}
                      fieldErrors={fieldErrors}
                    />
                    <TaskChecklistEditor
                      actors={actors}
                      value={draft.checklists}
                      onChange={(checklists) => patch({ checklists })}
                      fieldErrors={fieldErrors}
                    />
                  </div>
                </div>
              ),
            },
            {
              id: "relations",
              label: "Связи и диалоги",
              icon: <Link2 size={15} />,
              content: (
                <div className={styles.tabContent}>
                  <TaskDraftRelations {...props} />
                </div>
              ),
            },
            {
              id: "git",
              label: `Git${draft.gitLinks.length ? ` · ${draft.gitLinks.length}` : ""}`,
              icon: <GitBranch size={15} />,
              content: (
                <div className={styles.tabContent}>
                  <TaskGitLinksEditor
                    value={draft.gitLinks}
                    onChange={(gitLinks) => patch({ gitLinks })}
                    fieldErrors={fieldErrors}
                  />
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
