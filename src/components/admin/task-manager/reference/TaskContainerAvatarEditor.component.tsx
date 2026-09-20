/**
 * @file src/components/admin/task-manager/reference/TaskContainerAvatarEditor.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Даёт загрузить или удалить аватарку контейнера в существующей форме настроек.
 * @see documentation/specifications/task-management.md
 */
import { ImagePlus, X } from "lucide-react";
import { UiButton } from "@realize/ui-kit";
import { TaskLocationMark } from "./TaskLocationMark.component";
import { useTaskContainerAvatar } from "./useTaskContainerAvatar.hook";
import type { TaskContainerAvatarEditorProps } from "./taskHierarchyManagement.types";
import styles from "./TaskDraftEditor.module.css";

export function TaskContainerAvatarEditor(
  props: TaskContainerAvatarEditorProps,
) {
  const { appearance, value, disabled, loading } = props;
  const avatar = useTaskContainerAvatar(props);
  const { inputRef } = avatar;
  return (
    <div>
      <div className={styles.avatarEditor}>
        <TaskLocationMark
          appearance={{ ...appearance, imageSrc: value }}
          size="medium"
        />
        <div className={styles.avatarControls}>
          <div>
            <UiButton
              variant="secondary"
              size="small"
              onClick={avatar.choose}
              disabled={disabled || loading}
            >
              <ImagePlus size={15} aria-hidden="true" />
              {loading
                ? "Обработка…"
                : value
                  ? "Заменить аватарку"
                  : "Добавить аватарку"}
            </UiButton>
            {value && (
              <UiButton
                variant="ghost"
                size="icon"
                onClick={avatar.clear}
                disabled={disabled}
                aria-label="Удалить аватарку"
                title="Удалить аватарку"
              >
                <X size={15} aria-hidden="true" />
              </UiButton>
            )}
          </div>
          <small>PNG, JPEG, WebP · до 2 МБ</small>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          disabled={disabled || loading}
          aria-label="Аватарка контейнера"
          onChange={avatar.onFileChange}
        />
      </div>
      {avatar.error && (
        <p className={styles.errorSummary} role="alert">
          {avatar.error}
        </p>
      )}
    </div>
  );
}
