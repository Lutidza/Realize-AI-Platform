/**
 * @file src/components/admin/task-manager/reference/TaskHierarchyManagerDialogs.component.tsx
 * @version 1.2.0
 * @date 2026-09-18
 * @description Показывает настройки контейнера и подтверждение удаления его содержимого.
 * @see documentation/specifications/task-management.md
 */
import { useId } from "react";
import {
  UiButton,
  UiConfirmation,
  UiDialog,
  UiInput,
  UiTextarea,
  UiSwitch,
} from "@realize/ui-kit";
import type { TaskHierarchyManagerDialogsProps } from "./taskHierarchyManagement.types";
import { TaskContainerAvatarEditor } from "./TaskContainerAvatarEditor.component";
import styles from "./TaskDraftEditor.module.css";

export function TaskHierarchyManagerDialogs({
  theme,
  manager: m,
}: TaskHierarchyManagerDialogsProps) {
  const formId = useId();
  const kind = m.target
    ? { project: "проекта", folder: "папки", list: "списка" }[
        m.target.location.kind
      ]
    : "раздела";
  const deletionKind = m.target?.location.kind;
  const deletionCounts = [
    ["Папок", (m.deletion?.folders ?? 0) - Number(deletionKind === "folder")],
    ["Списков", (m.deletion?.lists ?? 0) - Number(deletionKind === "list")],
    ["Задач", m.deletion?.tasks.length ?? 0],
  ]
    .filter(([, count]) => Number(count) > 0)
    .map(([label, count]) => `${label}: ${count}`)
    .join(" · ");
  const blockedReason =
    m.deletion?.reason ||
    (!m.access.canWrite ? "Недостаточно прав для удаления." : "");
  return (
    <>
      <UiDialog
        open={m.target?.mode === "settings"}
        mode={theme}
        title={`Настройки ${kind}`}
        description={m.info?.name ?? "Настройки раздела"}
        onOpenChange={(open) => {
          if (!open) m.requestClose();
        }}
        footer={
          <div className={styles.footer}>
            <p>
              {m.dirty ? "Есть несохранённые изменения" : "Настройки раздела"}
            </p>
            <div className={styles.footerActions}>
              <UiButton variant="ghost" onClick={m.requestClose}>
                Отмена
              </UiButton>
              <UiButton
                type="submit"
                form={formId}
                disabled={!m.access.canRead || m.avatarLoading}
              >
                Сохранить
              </UiButton>
            </div>
          </div>
        }
      >
        <form
          id={formId}
          className={styles.stack}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            m.save();
          }}
        >
          <p className={styles.locationContext}>{m.path}</p>
          {m.appearance && m.target && (
            <TaskContainerAvatarEditor
              key={`${m.target.location.kind}:${m.target.location.id}`}
              appearance={m.appearance}
              value={m.avatar}
              onChange={m.setAvatar}
              disabled={!m.access.canWrite}
              loading={m.avatarLoading}
              onLoadingChange={m.setAvatarLoading}
            />
          )}
          {m.error && (
            <p className={styles.errorSummary} role="alert">
              {m.error}
            </p>
          )}
          <label className={styles.field}>
            <span>
              Название <span aria-hidden="true">*</span>
            </span>
            <UiInput
              autoFocus
              value={m.name}
              maxLength={100}
              aria-required
              disabled={!m.access.canWrite}
              onChange={(event) => m.setName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Описание</span>
            <UiTextarea
              value={m.description}
              maxLength={600}
              rows={4}
              disabled={!m.access.canWrite}
              onChange={(event) => m.setDescription(event.target.value)}
            />
          </label>
          <label className={styles.sectionHeading}>
            <span>Показывать в боковой навигации</span>
            <UiSwitch
              checked={m.visible}
              onChange={(event) => m.setVisible(event.target.checked)}
            />
          </label>
          <p className={styles.callout}>
            Видимость настраивается для вашего браузера. Данные раздела остаются
            доступны.
          </p>
        </form>
      </UiDialog>
      <UiConfirmation
        open={m.target?.mode === "delete"}
        mode={theme}
        title={
          blockedReason
            ? "Удаление недоступно"
            : `Удалить ${deletionKind === "project" ? "проект" : deletionKind === "folder" ? "папку" : "список"}?`
        }
        subject={m.info?.name}
        description={`${deletionCounts ? `${deletionCounts}. ` : ""}Отменить нельзя.`}
        blockedReason={blockedReason}
        error={m.error}
        tone="danger"
        confirmLabel="Удалить"
        onConfirm={m.remove}
        onCloseAutoFocus={m.onDeleteCloseAutoFocus}
        onOpenChange={(open) => {
          if (!open) m.close();
        }}
      />
      <UiDialog
        open={m.discardOpen}
        mode={theme}
        title="Закрыть без сохранения?"
        description="Изменения настроек будут потеряны."
        onOpenChange={m.setDiscardOpen}
        footer={
          <div className={styles.footerActions}>
            <UiButton variant="ghost" onClick={() => m.setDiscardOpen(false)}>
              Продолжить
            </UiButton>
            <UiButton onClick={m.close}>Не сохранять</UiButton>
          </div>
        }
      >
        <p>Название, описание, аватарка и видимость останутся прежними.</p>
      </UiDialog>
    </>
  );
}
