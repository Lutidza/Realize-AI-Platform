/**
 * @file src/components/admin/task-manager/reference/TaskCreateDialog.component.tsx
 * @version 3.1.0
 * @date 2026-09-19
 * @description Создаёт и редактирует полный черновик задачи с сохранением ввода при отказе.
 * @see documentation/specifications/task-management.md
 */

"use client";

import { UiButton, UiDialog } from "@realize/ui-kit";
import { useId } from "react";
import type { TaskCreateDialogProps } from "./TaskComposer.types";
import { TaskDraftEditor } from "./TaskDraftEditor.component";
import { useTaskComposer } from "./useTaskComposer.hook";
import styles from "./TaskDraftEditor.module.css";

/** Создание и редактирование задачи используют один полный draft с явным контейнером List. */
export function TaskCreateDialog(props: TaskCreateDialogProps) {
  const {
    draft,
    change,
    fieldErrors,
    error,
    errorRef,
    dirty,
    close,
    save,
    discardOpen,
    setDiscardOpen,
  } = useTaskComposer(props);
  const formId = useId();
  const content = (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className={styles.stack}
    >
      {error && (
        <div
          className={styles.errorSummary}
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          <strong>{error}</strong>
          {Object.keys(fieldErrors).length > 0 && (
            <ul>
              {[...new Set(Object.values(fieldErrors))].map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <TaskDraftEditor
        compact={Boolean(props.renderCreation)}
        initialTab={props.initialTab}
        draft={draft}
        taskId={props.task?.id}
        actors={props.actors}
        hierarchy={props.hierarchy}
        tasks={props.tasks}
        conversations={props.conversations}
        fieldErrors={fieldErrors}
        onChange={change}
      />
    </form>
  );
  return (
    <>
      <UiDialog
        open
        mode={props.theme}
        size={props.renderCreation ? "medium" : "wide"}
        title={
          props.renderCreation
            ? "Создать"
            : props.task
              ? `Редактирование · ${props.task.id}`
              : props.parentId
                ? "Новая подзадача"
                : "Новая задача"
        }
        description={
          props.renderCreation
            ? undefined
            : "Заполните задачу, участников и контекст."
        }
        onOpenChange={(open) => {
          if (!open) close();
        }}
        footer={
          <div className={styles.footer}>
            <p>{dirty ? "Есть несохранённые изменения" : "Новая задача"}</p>
            <div className={styles.footerActions}>
              <UiButton type="button" variant="ghost" onClick={close}>
                Отмена
              </UiButton>
              <UiButton type="submit" form={formId}>
                {props.task ? "Сохранить изменения" : "Создать задачу"}
              </UiButton>
            </div>
          </div>
        }
      >
        {props.renderCreation ? props.renderCreation(content, dirty) : content}
      </UiDialog>
      <UiDialog
        open={discardOpen}
        mode={props.theme}
        title="Сохранить изменения?"
        description="Черновик ещё не записан в задачу."
        onOpenChange={setDiscardOpen}
        footer={
          <div className={styles.footerActions}>
            <UiButton variant="ghost" onClick={() => setDiscardOpen(false)}>
              Продолжить редактирование
            </UiButton>
            <UiButton variant="secondary" onClick={props.onClose}>
              Отбросить
            </UiButton>
            <UiButton
              onClick={() => {
                setDiscardOpen(false);
                save();
              }}
            >
              Сохранить
            </UiButton>
          </div>
        }
      >
        <div className={styles.discard}>
          <p>
            Можно сохранить заполненные поля или закрыть форму без изменений.
          </p>
        </div>
      </UiDialog>
    </>
  );
}
