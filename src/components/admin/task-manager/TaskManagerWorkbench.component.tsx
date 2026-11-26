/**
 * @file src/components/admin/task-manager/TaskManagerWorkbench.component.tsx
 * @version 1.2.1
 * @date 2026-11-26
 * @description Подключает постоянные проекты и задачи к нейтральному template host.
 * @see documentation/specifications/task-management-execution.md
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import { Plus } from "lucide-react";
import {
  UiBadge,
  UiButton,
  UiNotice,
  UiSelect,
  UiSurface,
} from "@realize/ui-kit";
import { SystemAdminTemplateHost } from "../system-shell/SystemAdminTemplateHost.component";
import { getSystemAdminNavigation } from "../system-shell/systemAdmin.navigation";
import { useSystemAdminNavigationPreferences } from "../system-shell/useSystemAdminNavigationPreferences.hook";
import { useSystemAdminLocale } from "../system-shell/useSystemAdminLocale.hook";
import type { TaskManagerWorkbenchProps } from "./TaskManager.types";
import { useTaskManager } from "./useTaskManager.hook";
import { TaskEditor } from "./TaskEditor.component";
import { TaskProjectComposer } from "./TaskProjectComposer.component";
import { TaskDetail } from "./TaskDetail.component";
import { taskPriorityLabels, taskStatusLabels } from "./taskManager.constants";
import styles from "./TaskManagerWorkbench.module.css";

/** Публичный reference использует свой store; рабочий экран получает все сущности только из API. */
export function TaskManagerWorkbench(props: TaskManagerWorkbenchProps) {
  const manager = useTaskManager(props);
  const preferences = useSystemAdminNavigationPreferences();
  const { locale } = useSystemAdminLocale();
  const actorName = (id: string | null) =>
    id
      ? (manager.participants.find((actor) => actor.id === id)?.name ?? id)
      : "Не назначен";
  const navigation = (onNavigate: () => void) => (
    <div className={styles.navigation}>
      <div className={styles.sectionHeading}>
        <h2>Проекты</h2>
        <UiButton
          size="small"
          variant="ghost"
          aria-label="Новый проект"
          title="Новый проект"
          onClick={() => manager.setProjectOpen(true)}
        >
          <Plus size={17} aria-hidden="true" />
        </UiButton>
      </div>
      <label className={styles.field}>
        Проект
        <UiSelect
          value={manager.projectId}
          disabled={manager.loading}
          onChange={(event) => {
            manager.selectProject(event.target.value);
            onNavigate();
          }}
        >
          {!manager.projects.length && (
            <option value="">Нет доступных проектов</option>
          )}
          {manager.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </UiSelect>
      </label>
      {manager.projectCursor && (
        <UiButton
          size="small"
          variant="ghost"
          disabled={manager.paging !== null}
          onClick={() => {
            void manager.more("projects");
          }}
        >
          Ещё проекты
        </UiButton>
      )}
      <label className={styles.field}>
        Список задач
        <UiSelect
          value={manager.listId}
          disabled={manager.listsLoading || !manager.lists.length}
          onChange={(event) => {
            manager.selectList(event.target.value);
            onNavigate();
          }}
        >
          {!manager.lists.length && (
            <option value="">
              {manager.listsLoading ? "Загрузка…" : "Нет доступных списков"}
            </option>
          )}
          {manager.lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.title}
            </option>
          ))}
        </UiSelect>
      </label>
      {manager.listCursor && (
        <UiButton
          size="small"
          variant="ghost"
          disabled={manager.paging !== null}
          onClick={() => {
            void manager.more("lists");
          }}
        >
          Ещё списки
        </UiButton>
      )}
      <p className={styles.muted}>{manager.project?.description}</p>
    </div>
  );
  return (
    <>
      <SystemAdminTemplateHost
        screen="workspace"
        mode={manager.theme}
        onModeChange={manager.setTheme}
        locale={locale}
        {...preferences}
        navigation={getSystemAdminNavigation({
          onTasks: () => manager.setSelectedId(null),
          tasksPanel: navigation,
        })}
        activeNavigationId="tasks"
        secondaryNavigation={navigation}
        capabilities={{
          account: {
            user: {
              name: props.currentActor.name,
              initials: props.currentActor.name.slice(0, 2).toUpperCase(),
            },
            profileActions: [],
          },
        }}
        breadcrumbs={[
          {
            id: "tasks",
            label: "Задачи",
            onSelect: () => manager.setSelectedId(null),
          },
          ...(manager.project
            ? [
                {
                  id: manager.project.id,
                  label: manager.project.title,
                  onSelect: () => manager.setSelectedId(null),
                },
              ]
            : []),
          ...(manager.list
            ? [
                {
                  id: manager.list.id,
                  label: manager.list.title,
                  onSelect: () => manager.setSelectedId(null),
                },
              ]
            : []),
        ]}
        pageActions={[
          {
            id: "create-task",
            label: "Создать задачу",
            icon: <Plus size={16} aria-hidden="true" />,
            disabled:
              !manager.canWrite ||
              !manager.listId ||
              manager.loading ||
              manager.listsLoading ||
              manager.tasksLoading,
            onSelect: () => manager.setEditing(null),
          },
        ]}
        footer={
          <span className={styles.muted} role="status" aria-live="polite">
            {manager.notice}
          </span>
        }
      >
        <div className={styles.workbench}>
          {manager.error && (
            <UiNotice
              tone="danger"
              role="alert"
              title="Не удалось загрузить данные"
            >
              <p>{manager.error}</p>
              <UiButton
                variant="secondary"
                size="small"
                onClick={manager.retry}
              >
                Повторить загрузку
              </UiButton>
            </UiNotice>
          )}
          {manager.loading ? (
            <p role="status">Загрузка проектов…</p>
          ) : !manager.projects.length ? (
            <UiSurface className={styles.empty}>
              <h2>Начните с проекта</h2>
              <p>Создайте проект и добавьте первую задачу в его список.</p>
              <UiButton onClick={() => manager.setProjectOpen(true)}>
                Создать первый проект
              </UiButton>
            </UiSurface>
          ) : (
            <>
              {manager.tasksLoading || manager.listsLoading ? (
                <p role="status">Загрузка задач…</p>
              ) : !manager.tasks.length ? (
                <UiSurface className={styles.empty}>
                  <h2>
                    {manager.listId
                      ? "В списке пока нет задач"
                      : "Список задач недоступен"}
                  </h2>
                  <p>
                    {manager.listId
                      ? "Добавьте задание, описание и исполнителя."
                      : "Выберите доступный список проекта."}
                  </p>
                </UiSurface>
              ) : (
                <UiSurface className={styles.tableScroll}>
                  <table className={styles.taskTable}>
                    <caption className={styles.srOnly}>
                      Задачи выбранного списка
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Задача</th>
                        <th scope="col">Статус</th>
                        <th scope="col">Исполнитель</th>
                        <th scope="col">Приоритет</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manager.tasks.map((task) => (
                        <tr
                          key={task.id}
                          data-selected={manager.selectedId === task.id}
                        >
                          <td>
                            <UiButton
                              variant="ghost"
                              size="small"
                              onClick={() => manager.setSelectedId(task.id)}
                            >
                              <span className={styles.taskTitle}>
                                <small>{task.key}</small>
                                <span>{task.title}</span>
                              </span>
                            </UiButton>
                          </td>
                          <td>
                            <UiBadge>{taskStatusLabels[task.status]}</UiBadge>
                          </td>
                          <td>{actorName(task.assigneeId)}</td>
                          <td>{taskPriorityLabels[task.priority]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </UiSurface>
              )}
              {manager.taskCursor && (
                <div>
                  <UiButton
                    variant="ghost"
                    disabled={manager.paging !== null}
                    onClick={() => {
                      void manager.more("tasks");
                    }}
                  >
                    {manager.paging === "tasks" ? "Загрузка…" : "Ещё задачи"}
                  </UiButton>
                </div>
              )}
              {manager.detailLoading && <p role="status">Загрузка карточки…</p>}
              {manager.task && (
                <TaskDetail
                  task={manager.task}
                  events={manager.events}
                  participants={manager.participants}
                  moreEvents={Boolean(manager.eventCursor)}
                  eventsLoading={manager.eventsLoading}
                  onMoreEvents={() => {
                    void manager.more("events");
                  }}
                  onEdit={() => manager.setEditing(manager.task)}
                  onClose={() => manager.setSelectedId(null)}
                />
              )}
            </>
          )}
        </div>
      </SystemAdminTemplateHost>
      {manager.projectOpen && (
        <TaskProjectComposer
          theme={manager.theme}
          currentActor={props.currentActor}
          participants={manager.participants}
          moreParticipants={Boolean(manager.participantCursor)}
          onMoreParticipants={() => {
            void manager.more("participants");
          }}
          onClose={() => manager.setProjectOpen(false)}
          onSave={manager.createProject}
        />
      )}
      {manager.editing !== undefined && (
        <TaskEditor
          key={manager.editing?.id ?? "create"}
          task={manager.editing}
          theme={manager.theme}
          projectId={manager.projectId}
          listId={manager.listId}
          participants={manager.participants}
          moreParticipants={Boolean(manager.participantCursor)}
          onMoreParticipants={() => {
            void manager.more("participants");
          }}
          onClose={() => manager.setEditing(undefined)}
          onSave={manager.saveTask}
          onReload={manager.reloadTask}
        />
      )}
    </>
  );
}
