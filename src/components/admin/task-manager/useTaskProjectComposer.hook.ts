/**
 * @file src/components/admin/task-manager/useTaskProjectComposer.hook.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Ведёт создание проекта и участников с повторяемой доставкой команды.
 * @see documentation/specifications/task-management-execution.md
 */
"use client";
import { useState } from "react";
import { taskProjectCreateSchema } from "@realize/payload-task-manager/contracts";
import type { TaskProjectCreateInput } from "@realize/payload-task-manager/contracts";
import { TaskManagerClientError } from "./TaskManagerClient.error";
import type { TaskProjectComposerProps } from "./TaskManager.types";
import { useTaskMutation } from "./useTaskMutation.hook";

export function useTaskProjectComposer(props: TaskProjectComposerProps) {
  const [draft, setDraft] = useState<TaskProjectCreateInput>({
    title: "",
    description: "",
    memberIds: [],
  });
  const [discardOpen, setDiscardOpen] = useState(false);
  const { submit, pending, error, errorRef, setError } = useTaskMutation(
    props.onSave,
  );
  const dirty = Boolean(
    draft.title || draft.description || draft.memberIds.length,
  );
  const unknownOutcome = Boolean(
    error &&
    (error.status === 0 ||
      error.status >= 500 ||
      error.code === "invalid_response"),
  );
  function change(patch: Partial<TaskProjectCreateInput>) {
    if (!pending && !unknownOutcome)
      setDraft((current) => ({ ...current, ...patch }));
  }
  async function save() {
    const parsed = taskProjectCreateSchema.safeParse(draft);
    if (!parsed.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of parsed.error.issues)
        (fields[issue.path.join(".")] ??= []).push(issue.message);
      setError(
        new TaskManagerClientError(
          "Проверьте поля проекта.",
          "validation_error",
          400,
          fields,
        ),
      );
      return;
    }
    const result = await submit(draft);
    if (result) props.onClose();
  }
  function close() {
    if (pending || unknownOutcome) return;
    if (dirty) setDiscardOpen(true);
    else props.onClose();
  }
  return {
    draft,
    change,
    dirty,
    save,
    close,
    discardOpen,
    setDiscardOpen,
    unknownOutcome,
    pending,
    error,
    errorRef,
  };
}
