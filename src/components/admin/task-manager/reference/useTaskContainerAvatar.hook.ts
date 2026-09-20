/**
 * @file src/components/admin/task-manager/reference/useTaskContainerAvatar.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Обрабатывает выбор картинки без запоздавшего изменения закрытого или сменившегося черновика.
 * @see documentation/specifications/task-management.md
 */
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { readTaskContainerAvatar } from "./taskContainerAvatar";
import type { TaskContainerAvatarEditorProps } from "./taskHierarchyManagement.types";

export function useTaskContainerAvatar({
  onChange,
  onLoadingChange,
  disabled,
}: TaskContainerAvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      revision.current += 1;
      onLoadingChange(false);
    },
    [onLoadingChange],
  );
  return {
    inputRef,
    error,
    choose: () => inputRef.current?.click(),
    clear: () => {
      revision.current += 1;
      setError("");
      onLoadingChange(false);
      onChange(undefined);
    },
    onFileChange: async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || disabled) return;
      const request = ++revision.current;
      setError("");
      onLoadingChange(true);
      try {
        const avatar = await readTaskContainerAvatar(file);
        if (request === revision.current) onChange(avatar);
      } catch (error) {
        if (request === revision.current)
          setError(
            error instanceof Error && error.name === "Error"
              ? error.message
              : "Не удалось прочитать изображение.",
          );
      } finally {
        if (request === revision.current) onLoadingChange(false);
      }
    },
  };
}
