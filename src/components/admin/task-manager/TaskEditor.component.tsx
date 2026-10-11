/**
 * @file src/components/admin/task-manager/TaskEditor.component.tsx
 * @version 1.0.0
 * @date 2026-10-11
 * @description Показывает рабочую форму задачи с сохранением draft при конфликте версии.
 * @see documentation/specifications/task-management-execution.md
 */
"use client";
import { useId } from "react";
import {
  UiButton,
  UiDialog,
  UiInput,
  UiSelect,
  UiTextarea,
} from "@realize/ui-kit";
import type { TaskEditorProps } from "./TaskManager.types";
import { taskPriorityLabels, taskStatusLabels } from "./taskManager.constants";
import { useTaskEditor } from "./useTaskEditor.hook";
import { TaskGitBindingsEditor } from "./TaskGitBindingsEditor.component";
import styles from "./TaskManagerWorkbench.module.css";

export function TaskEditor(props: TaskEditorProps) {
  const {
    draft,
    change,
    revision,
    dirty,
    fieldErrors,
    discard,
    setDiscard,
    close,
    save,
    reload,
    reloading,
    unknownOutcome,
    conflict,
    pending,
    error,
    errorRef,
  } = useTaskEditor(props);
  const formId = useId();
  return (
    <>
      <UiDialog
        open
        mode={props.theme}
        size="wide"
        title={
          props.task ? `Редактирование · ${props.task.key}` : "Новая задача"
        }
        description={
          revision
            ? `Ревизия ${revision}`
            : "Задача сохраняется в выбранном списке."
        }
        onOpenChange={(open) => {
          if (!open) close();
        }}
        hideCloseButton={pending || unknownOutcome}
        footer={
          <div className={styles.dialogFooter}>
            <span className={styles.muted}>
              {unknownOutcome
                ? "Повторите сохранение, чтобы подтвердить результат."
                : dirty
                  ? "Есть несохранённые изменения"
                  : ""}
            </span>
            <div className={styles.actions}>
              <UiButton
                type="button"
                variant="ghost"
                disabled={pending || reloading || unknownOutcome}
                onClick={close}
              >
                Отмена
              </UiButton>
              <UiButton
                form={formId}
                type="submit"
                disabled={pending || reloading}
              >
                {pending
                  ? "Сохранение…"
                  : unknownOutcome
                    ? "Повторить сохранение"
                    : props.task
                      ? "Сохранить изменения"
                      : "Создать задачу"}
              </UiButton>
            </div>
          </div>
        }
      >
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className={styles.stack}
        >
          {error && (
            <div
              role="alert"
              tabIndex={-1}
              ref={errorRef}
              className={styles.error}
            >
              <strong>{error.message}</strong>
              {Object.keys(fieldErrors).length > 0 && (
                <ul>
                  {Object.entries(fieldErrors).map(([field, errors]) => (
                    <li key={field}>
                      {field}: {errors.join(" ")}
                    </li>
                  ))}
                </ul>
              )}
              {conflict && props.task && (
                <p>
                  <UiButton
                    type="button"
                    variant="secondary"
                    onClick={() => setDiscard("reload")}
                  >
                    Загрузить актуальную версию
                  </UiButton>
                </p>
              )}
            </div>
          )}
          <fieldset
            className={styles.formFields}
            disabled={pending || reloading || unknownOutcome}
          >
            <label className={styles.field}>
              Название задачи
              <UiInput
                value={draft.title}
                maxLength={200}
                required
                aria-invalid={Boolean(fieldErrors.title)}
                onChange={(event) => change({ title: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              Описание
              <UiTextarea
                value={draft.description}
                rows={5}
                maxLength={20000}
                aria-invalid={Boolean(fieldErrors.description)}
                onChange={(event) =>
                  change({ description: event.target.value })
                }
              />
            </label>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                Статус
                <UiSelect
                  value={draft.status}
                  onChange={(event) =>
                    change({
                      status: event.target.value as typeof draft.status,
                    })
                  }
                >
                  {Object.entries(taskStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </UiSelect>
              </label>
              <label className={styles.field}>
                Приоритет
                <UiSelect
                  value={draft.priority}
                  onChange={(event) =>
                    change({
                      priority: event.target.value as typeof draft.priority,
                    })
                  }
                >
                  {Object.entries(taskPriorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </UiSelect>
              </label>
              <label className={`${styles.field} ${styles.fullWidth}`}>
                Исполнитель
                <UiSelect
                  value={draft.assigneeId ?? ""}
                  onChange={(event) =>
                    change({ assigneeId: event.target.value || null })
                  }
                >
                  <option value="">Не назначен</option>
                  {draft.assigneeId &&
                    !props.participants.some(
                      (actor) => actor.id === draft.assigneeId,
                    ) && (
                      <option value={draft.assigneeId}>
                        {draft.assigneeId}
                      </option>
                    )}
                  {props.participants.map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.name}
                    </option>
                  ))}
                </UiSelect>
              </label>
            </div>
            {props.moreParticipants && (
              <div>
                <UiButton
                  type="button"
                  size="small"
                  variant="ghost"
                  onClick={props.onMoreParticipants}
                >
                  Загрузить ещё участников
                </UiButton>
              </div>
            )}
            <TaskGitBindingsEditor
              value={draft.gitBindings}
              onChange={(gitBindings) => change({ gitBindings })}
            />
          </fieldset>
        </form>
      </UiDialog>
      <UiDialog
        open={discard !== null}
        mode={props.theme}
        size="compact"
        role="alertdialog"
        title={
          discard === "reload"
            ? "Загрузить актуальную задачу?"
            : "Отбросить черновик?"
        }
        description={
          discard === "reload"
            ? "Ваш ввод будет заменён сохранённой версией задачи."
            : "Несохранённые изменения будут потеряны."
        }
        onOpenChange={(open) => {
          if (!open && !reloading) setDiscard(null);
        }}
        footer={
          <div className={styles.actions}>
            <UiButton
              variant="ghost"
              disabled={reloading}
              onClick={() => setDiscard(null)}
            >
              Продолжить редактирование
            </UiButton>
            <UiButton
              disabled={reloading}
              onClick={() => {
                if (discard === "reload") void reload();
                else props.onClose();
              }}
            >
              {reloading
                ? "Загрузка…"
                : discard === "reload"
                  ? "Загрузить"
                  : "Отбросить"}
            </UiButton>
          </div>
        }
      />
    </>
  );
}
