/**
 * @file src/components/admin/task-manager/reference/WorkspaceCreateDialog.component.tsx
 * @version 1.1.0
 * @date 2026-09-19
 * @description Создаёт среду из полной формы и защищает заполненный черновик от закрытия.
 * @see documentation/specifications/task-management.md
 */

import { useId } from "react";
import { UiButton, UiDialog } from "@realize/ui-kit";
import { WorkspaceGeneralFields } from "./WorkspaceGeneralFields.component";
import { useWorkspaceComposer } from "./useWorkspaceComposer.hook";
import type { WorkspaceCreateDialogProps } from "./WorkspaceViews.types";
import styles from "./Workspace.module.css";

export function WorkspaceCreateDialog({
  theme,
  dispatch,
  onClose,
  onCreated,
  renderCreation,
}: WorkspaceCreateDialogProps) {
  const formId = useId();
  const composer = useWorkspaceComposer((draft) =>
    dispatch({ type: "workspace/create", draft }),
  );
  const { discardOpen, setDiscardOpen } = composer;
  const close = () => {
    if (composer.dirty) setDiscardOpen(true);
    else onClose();
  };
  const save = () => {
    const result = composer.save();
    if (result.ok && result.location) {
      onClose();
      onCreated(result.location.id);
    }
  };
  const content = (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <WorkspaceGeneralFields composer={composer} />
    </form>
  );
  return (
    <>
      <UiDialog
        open
        mode={theme}
        title={renderCreation ? "Создать" : "Новая рабочая среда"}
        description={
          renderCreation
            ? undefined
            : "Организуйте проекты, участников и общие правила работы команды."
        }
        onOpenChange={(open) => {
          if (!open) close();
        }}
        footer={
          <div className={styles.formActions}>
            <UiButton variant="ghost" onClick={close}>
              Отмена
            </UiButton>
            <UiButton type="submit" form={formId}>
              Создать среду
            </UiButton>
          </div>
        }
      >
        {renderCreation ? renderCreation(content, composer.dirty) : content}
      </UiDialog>
      <UiDialog
        open={discardOpen}
        mode={theme}
        title="Сохранить рабочую среду?"
        description="В форме есть несохранённые изменения."
        onOpenChange={setDiscardOpen}
        footer={
          <div className={styles.formActions}>
            <UiButton variant="ghost" onClick={() => setDiscardOpen(false)}>
              Продолжить
            </UiButton>
            <UiButton variant="secondary" onClick={onClose}>
              Не сохранять
            </UiButton>
            <UiButton
              onClick={() => {
                setDiscardOpen(false);
                save();
              }}
            >
              Создать среду
            </UiButton>
          </div>
        }
      >
        <p>Можно продолжить заполнение или создать среду сейчас.</p>
      </UiDialog>
    </>
  );
}
