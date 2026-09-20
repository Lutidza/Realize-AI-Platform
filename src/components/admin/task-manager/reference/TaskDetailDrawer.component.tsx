/**
 * @file src/components/admin/task-manager/reference/TaskDetailDrawer.component.tsx
 * @version 2.1.0
 * @date 2026-09-18
 * @description Собирает карточку задачи с полным редактором, результатами, историей и действиями.
 * @see documentation/specifications/task-management.md
 */

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { UiBadge, UiButton, UiTabs, UiTheme } from "@realize/ui-kit";
import {
  Archive,
  ArchiveRestore,
  Bot,
  ChevronRight,
  CircleCheck,
  Copy,
  FolderOpen,
  GitBranch,
  Link2,
  ListChecks,
  Pencil,
  X,
} from "lucide-react";
import type { TaskDetailDrawerProps } from "./TaskDetail.types";
import { TaskDossier, TaskRelations } from "./TaskDetailSections.component";
import { TaskExecution } from "./TaskDetailExecution.component";
import { TaskDetailOverview } from "./TaskDetailOverview.component";
import { TaskDetailGit } from "./TaskDetailGit.component";
import { TaskDetailActivity } from "./TaskDetailActivity.component";
import { TaskCreateDialog } from "./TaskCreateDialog.component";
import { useTaskDetailControls } from "./useTaskDetailControls.hook";
import { taskTypeLabels } from "./taskComposer.constants";
import { getLocationPath } from "./taskManager.hierarchy";
import styles from "./TaskDetailDrawer.module.css";

/** Фокус сохраняется при переходе между связанными задачами и возвращается в исходное представление. */
export function TaskDetailDrawer(props: TaskDetailDrawerProps) {
  const { task, state, actors, theme, dispatch, onClose, onCreateSubtask } =
    props;
  const {
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
    onOpenAutoFocus,
    onCloseAutoFocus,
  } = useTaskDetailControls(props);
  if (!task) return null;
  const locationPath = getLocationPath(state, {
    kind: "list",
    id: task.listId,
  });
  const edit = (
    tab: "details" | "people" | "checklists" | "git" = "details",
  ) => {
    setEditingTab(tab);
    setEditing(true);
  };
  return (
    <>
      <Dialog.Root
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Dialog.Portal>
          <UiTheme mode={theme} baseline className={styles.portal}>
            <Dialog.Overlay className={styles.overlay} />
            <Dialog.Content
              className={styles.dialog}
              onOpenAutoFocus={onOpenAutoFocus}
              onCloseAutoFocus={onCloseAutoFocus}
            >
              <header className={styles.topbar}>
                <div
                  className={styles.breadcrumb}
                  aria-label="Расположение задачи"
                  title={[
                    ...locationPath.map((part) => part.name),
                    task.id,
                  ].join(" / ")}
                >
                  <FolderOpen size={16} />
                  <span>
                    {locationPath.length
                      ? locationPath.map((part) => part.name).join(" / ")
                      : "Расположение недоступно"}
                  </span>
                  <ChevronRight size={13} />
                  <span>{task.id}</span>
                </div>
                <div className={styles.topbarActions}>
                  <UiBadge>{task.archived ? "В архиве" : "Демо"}</UiBadge>
                  <Dialog.Close asChild>
                    <UiButton
                      variant="ghost"
                      size="icon"
                      aria-label="Закрыть карточку задачи"
                    >
                      <X size={18} />
                    </UiButton>
                  </Dialog.Close>
                </div>
              </header>
              <div className={styles.columns}>
                <main className={styles.main}>
                  <div className={styles.titleBlock}>
                    <div className={styles.kicker}>
                      <CircleCheck size={15} />
                      <span>{taskTypeLabels[task.taskType]}</span>
                      <span className={styles.muted}>{task.id}</span>
                    </div>
                    <Dialog.Title
                      ref={heading}
                      tabIndex={-1}
                      className={styles.title}
                    >
                      {task.title}
                    </Dialog.Title>
                    <Dialog.Description className={styles.visuallyHidden}>
                      Карточка задачи. Поля, участники, чеклисты, подзадачи,
                      связи, досье, исполнение и история. Изменения сохраняются
                      в демонстрационном сеансе.
                    </Dialog.Description>
                    <div className={styles.tags}>
                      {task.tags.map((tag) => (
                        <UiBadge key={tag}>{tag}</UiBadge>
                      ))}
                    </div>
                    <div className={styles.taskActions}>
                      <UiButton
                        variant="secondary"
                        size="small"
                        disabled={task.archived}
                        onClick={() => edit()}
                      >
                        <Pencil size={14} /> Редактировать задачу
                      </UiButton>
                      <UiButton
                        variant="ghost"
                        size="small"
                        onClick={duplicate}
                      >
                        <Copy size={14} /> Дублировать
                      </UiButton>
                      <UiButton
                        variant="ghost"
                        size="small"
                        onClick={() =>
                          dispatch({
                            type: "task/archive",
                            taskId: task.id,
                            archived: !task.archived,
                          })
                        }
                      >
                        {task.archived ? (
                          <ArchiveRestore size={14} />
                        ) : (
                          <Archive size={14} />
                        )}
                        {task.archived ? "Восстановить" : "В архив"}
                      </UiButton>
                      <UiButton
                        variant="ghost"
                        size="icon"
                        aria-label="Копировать ID задачи"
                        title="Копировать ID"
                        onClick={() => void copy("id")}
                      >
                        <Copy size={15} />
                      </UiButton>
                      <UiButton
                        variant="ghost"
                        size="icon"
                        aria-label="Копировать ссылку на задачу"
                        title="Копировать ссылку"
                        onClick={() => void copy("link")}
                      >
                        <Link2 size={15} />
                      </UiButton>
                    </div>
                  </div>
                  <UiTabs
                    appearance="underline"
                    label="Разделы задачи"
                    value={tab}
                    onValueChange={setTab}
                    items={[
                      {
                        id: "overview",
                        label: "Обзор",
                        icon: <ListChecks size={15} />,
                        content: (
                          <div className={styles.tabContent}>
                            <TaskDetailOverview
                              key={task.id}
                              task={task}
                              actors={actors}
                              state={state}
                              dispatch={dispatch}
                              onOpenTask={openLinkedTask}
                              onCreateSubtask={onCreateSubtask}
                              onEdit={edit}
                            />
                          </div>
                        ),
                      },
                      {
                        id: "relations",
                        label: "Связи",
                        icon: <Link2 size={15} />,
                        content: (
                          <div className={styles.tabContent}>
                            <TaskRelations
                              key={task.id}
                              task={task}
                              state={state}
                              dispatch={dispatch}
                              onOpenTask={openLinkedTask}
                            />
                          </div>
                        ),
                      },
                      {
                        id: "git",
                        label: "Git",
                        icon: <GitBranch size={15} />,
                        content: (
                          <div className={styles.tabContent}>
                            <TaskDetailGit
                              key={task.id}
                              task={task}
                              onEdit={edit}
                            />
                          </div>
                        ),
                      },
                      {
                        id: "dossier",
                        label: "Досье",
                        icon: <FolderOpen size={15} />,
                        content: (
                          <div className={styles.tabContent}>
                            <TaskDossier key={task.id} task={task} />
                          </div>
                        ),
                      },
                      {
                        id: "execution",
                        label: "Исполнение",
                        icon: <Bot size={15} />,
                        content: (
                          <div className={styles.tabContent}>
                            <TaskExecution
                              key={task.id}
                              task={task}
                              actors={actors}
                              dispatch={dispatch}
                            />
                          </div>
                        ),
                      },
                    ]}
                  />
                </main>
                <TaskDetailActivity
                  key={task.id}
                  task={task}
                  dispatch={dispatch}
                />
              </div>
              <div
                role="status"
                aria-live="polite"
                className={styles.notice}
                data-error={!state.lastResult.ok}
              >
                {!state.lastResult.ok
                  ? state.notice
                  : localNotice ||
                    state.notice ||
                    "Изменения сохраняются в этом сеансе"}
              </div>
            </Dialog.Content>
          </UiTheme>
        </Dialog.Portal>
      </Dialog.Root>
      {editing && (
        <TaskCreateDialog
          kind="task"
          initialTab={editingTab}
          task={task}
          actors={actors}
          hierarchy={state}
          tasks={state.tasks}
          conversations={state.conversations}
          projectId={task.projectId}
          listId={task.listId}
          theme={theme}
          dispatch={dispatch}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
