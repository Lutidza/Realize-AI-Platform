/**
 * @file src/components/admin/task-manager/reference/WorkspaceManagerDialogs.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Показывает подтверждения сохранения черновика и архивирования рабочей среды.
 * @see documentation/specifications/task-management.md
 */

import { UiButton, UiDialog } from "@realize/ui-kit";
import type { WorkspaceManagerDialogsProps } from "./WorkspaceViews.types";
import styles from "./Workspace.module.css";

export function WorkspaceManagerDialogs({
  theme,
  manager,
  lastResult,
}: WorkspaceManagerDialogsProps) {
  return (
    <>
      <UiDialog
        open={manager.leaveOpen}
        mode={theme}
        title="Сохранить изменения среды?"
        description="В общих настройках есть несохранённые поля."
        onOpenChange={(open) => {
          if (!open) manager.cancelLeave();
        }}
        footer={
          <div className={styles.formActions}>
            <UiButton variant="ghost" onClick={manager.cancelLeave}>
              Продолжить редактирование
            </UiButton>
            <UiButton variant="secondary" onClick={manager.discardAndLeave}>
              Не сохранять
            </UiButton>
            <UiButton onClick={manager.saveAndLeave}>
              Сохранить и перейти
            </UiButton>
          </div>
        }
      >
        <p>
          Сохраните изменения перед переходом или оставьте прежние настройки.
        </p>
      </UiDialog>
      <UiDialog
        open={manager.archiveOpen}
        mode={theme}
        title="Архивировать рабочую среду?"
        description={manager.workspace?.name ?? "Рабочая среда"}
        onOpenChange={manager.setArchiveOpen}
        footer={
          <div className={styles.formActions}>
            <UiButton
              variant="ghost"
              onClick={() => manager.setArchiveOpen(false)}
            >
              Отмена
            </UiButton>
            <UiButton onClick={() => manager.archive(true)}>
              Архивировать
            </UiButton>
          </div>
        }
      >
        <p>
          Проекты, задачи и участники сохранятся. Среда будет доступна для
          чтения в архиве.
        </p>
        {manager.notice && !lastResult.ok ? (
          <p role="alert">{manager.notice}</p>
        ) : null}
      </UiDialog>
    </>
  );
}
