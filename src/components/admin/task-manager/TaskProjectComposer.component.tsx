/**
 * @file src/components/admin/task-manager/TaskProjectComposer.component.tsx
 * @version 1.0.0
 * @date 2026-10-11
 * @description Создаёт настоящий проект с участниками и серверным списком по умолчанию.
 * @see documentation/specifications/task-management-execution.md
 */
"use client";
import { useId } from "react";
import { UiButton, UiDialog, UiInput, UiTextarea } from "@realize/ui-kit";
import type { TaskProjectComposerProps } from "./TaskManager.types";
import { useTaskProjectComposer } from "./useTaskProjectComposer.hook";
import styles from "./TaskManagerWorkbench.module.css";

export function TaskProjectComposer(props: TaskProjectComposerProps) {
  const {
    draft,
    change,
    save,
    close,
    discardOpen,
    setDiscardOpen,
    unknownOutcome,
    pending,
    error,
    errorRef,
  } = useTaskProjectComposer(props);
  const formId = useId();
  return (
    <>
      <UiDialog
        open
        mode={props.theme}
        title="Новый проект"
        description="Список «Задачи» создаётся вместе с проектом."
        onOpenChange={(open) => {
          if (!open) close();
        }}
        hideCloseButton={pending || unknownOutcome}
        footer={
          <div className={styles.actions}>
            <UiButton
              type="button"
              variant="ghost"
              disabled={pending || unknownOutcome}
              onClick={close}
            >
              Отмена
            </UiButton>
            <UiButton form={formId} type="submit" disabled={pending}>
              {pending
                ? "Создание…"
                : unknownOutcome
                  ? "Повторить создание"
                  : "Создать проект"}
            </UiButton>
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
              className={styles.error}
              role="alert"
              tabIndex={-1}
              ref={errorRef}
            >
              <strong>{error.message}</strong>
              {Object.keys(error.fieldErrors).length > 0 && (
                <ul>
                  {Object.entries(error.fieldErrors).map(([field, errors]) => (
                    <li key={field}>
                      {field}: {errors.join(" ")}
                    </li>
                  ))}
                </ul>
              )}
              {unknownOutcome && (
                <p>Повторите создание, чтобы подтвердить результат.</p>
              )}
            </div>
          )}
          <fieldset
            className={styles.formFields}
            disabled={pending || unknownOutcome}
          >
            <label className={styles.field}>
              Название проекта
              <UiInput
                value={draft.title}
                maxLength={200}
                required
                aria-invalid={Boolean(error?.fieldErrors.title)}
                onChange={(event) => change({ title: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              Описание проекта
              <UiTextarea
                value={draft.description}
                rows={4}
                maxLength={20000}
                onChange={(event) =>
                  change({ description: event.target.value })
                }
              />
            </label>
            <section className={styles.stack} aria-label="Участники проекта">
              <h3>Участники</h3>
              <p className={styles.muted}>
                Владелец: {props.currentActor.name}. Участники могут читать и
                изменять задачи проекта.
              </p>
              {props.participants
                .filter((actor) => actor.id !== props.currentActor.id)
                .map((actor) => (
                  <label key={actor.id} className={styles.member}>
                    <input
                      type="checkbox"
                      checked={draft.memberIds.includes(actor.id)}
                      onChange={(event) =>
                        change({
                          memberIds: event.target.checked
                            ? [...draft.memberIds, actor.id]
                            : draft.memberIds.filter((id) => id !== actor.id),
                        })
                      }
                    />
                    {actor.name}
                  </label>
                ))}
              {props.moreParticipants && (
                <div>
                  <UiButton
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={props.onMoreParticipants}
                  >
                    Загрузить ещё участников
                  </UiButton>
                </div>
              )}
            </section>
          </fieldset>
        </form>
      </UiDialog>
      <UiDialog
        open={discardOpen}
        mode={props.theme}
        role="alertdialog"
        size="compact"
        title="Отбросить черновик проекта?"
        description="Несохранённые изменения будут потеряны."
        onOpenChange={setDiscardOpen}
        footer={
          <div className={styles.actions}>
            <UiButton variant="ghost" onClick={() => setDiscardOpen(false)}>
              Продолжить редактирование
            </UiButton>
            <UiButton onClick={props.onClose}>Отбросить</UiButton>
          </div>
        }
      />
    </>
  );
}
