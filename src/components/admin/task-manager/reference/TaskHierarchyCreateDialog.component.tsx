/**
 * @file src/components/admin/task-manager/reference/TaskHierarchyCreateDialog.component.tsx
 * @version 1.2.0
 * @date 2026-09-19
 * @description Создаёт рабочую среду, проект, папку или список в выбранном контексте.
 * @see documentation/specifications/task-management.md
 */

"use client";

import { useId } from "react";
import { UiButton, UiDialog, UiInput, UiTextarea } from "@realize/ui-kit";
import type { TaskHierarchyCreateDialogProps } from "./TaskHierarchyComposer.types";
import { useTaskHierarchyComposer } from "./useTaskHierarchyComposer.hook";
import { TaskHierarchyParentPicker } from "./TaskHierarchyParentPicker.component";
import styles from "./TaskDraftEditor.module.css";

/** Родительский путь виден до сохранения; ошибка модели сохраняет введённые поля. */
export function TaskHierarchyCreateDialog(
  props: TaskHierarchyCreateDialogProps,
) {
  const formId = useId();
  const {
    name,
    description,
    changeName,
    changeDescription,
    error,
    fieldErrors,
    errorRef,
    parentContext,
    location,
    changeLocation,
    dirty,
    discardOpen,
    setDiscardOpen,
    close,
    save,
  } = useTaskHierarchyComposer(props);
  const title = {
    workspace: "Новая рабочая среда",
    project: "Новый проект",
    folder: "Новая папка",
    list: "Новый список",
  }[props.location.kind];
  const content = (
    <form
      id={formId}
      className={styles.stack}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
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
              {[...new Set(Object.values(fieldErrors))].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {props.renderCreation && (
        <TaskHierarchyParentPicker
          state={props.state}
          location={location}
          onChange={changeLocation}
        />
      )}
      <p
        className={styles.locationContext}
        aria-label="Расположение нового раздела"
      >
        {parentContext}
      </p>
      <label className={styles.field}>
        <span>
          Название <span aria-hidden="true">*</span>
        </span>
        <UiInput
          autoFocus
          value={name}
          maxLength={100}
          onChange={(event) => changeName(event.target.value)}
          aria-required="true"
          aria-invalid={Boolean(fieldErrors.name)}
        />
        {fieldErrors.name && (
          <small className={styles.error}>{fieldErrors.name}</small>
        )}
      </label>
      {
        <label className={styles.field}>
          <span>Описание</span>
          <UiTextarea
            value={description}
            maxLength={600}
            rows={4}
            onChange={(event) => changeDescription(event.target.value)}
            aria-invalid={Boolean(fieldErrors.description)}
          />
          {fieldErrors.description && (
            <small className={styles.error}>{fieldErrors.description}</small>
          )}
        </label>
      }
      {props.location.kind === "project" && (
        <p className={styles.callout}>
          В проекте сразу появится основной список для задач.
        </p>
      )}
    </form>
  );
  return (
    <>
      <UiDialog
        open
        mode={props.theme}
        title={props.renderCreation ? "Создать" : title}
        description={
          props.renderCreation
            ? undefined
            : "Укажите название и проверьте расположение."
        }
        onOpenChange={(open) => {
          if (!open) close();
        }}
        footer={
          <div className={styles.footer}>
            <p>
              {dirty ? "Есть несохранённые изменения" : "Данные этого сеанса"}
            </p>
            <div className={styles.footerActions}>
              <UiButton variant="ghost" onClick={close}>
                Отмена
              </UiButton>
              <UiButton type="submit" form={formId}>
                {
                  {
                    workspace: "Создать среду",
                    project: "Создать проект",
                    folder: "Создать папку",
                    list: "Создать список",
                  }[location.kind]
                }
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
        description="В форме есть несохранённые данные."
        onOpenChange={setDiscardOpen}
        footer={
          <div className={styles.footerActions}>
            <UiButton variant="ghost" onClick={() => setDiscardOpen(false)}>
              Продолжить
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
          <p>Сохраните заполненные поля или закройте форму без создания.</p>
        </div>
      </UiDialog>
    </>
  );
}
