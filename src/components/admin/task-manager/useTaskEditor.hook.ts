/**
 * @file src/components/admin/task-manager/useTaskEditor.hook.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Ведёт черновик задачи и требует явной загрузки версии после конфликта.
 * @see documentation/specifications/task-management-execution.md
 */
"use client";
import { useState } from "react";
import {
  taskCreateSchema,
  taskUpdateSchema,
} from "@realize/payload-task-manager/contracts";
import type {
  TaskDto,
  TaskEditableFields,
} from "@realize/payload-task-manager/contracts";
import { TaskManagerClientError } from "./TaskManagerClient.error";
import type { TaskEditorProps } from "./TaskManager.types";
import { useTaskMutation } from "./useTaskMutation.hook";

function editable(task: TaskDto | null): TaskEditableFields {
  return task
    ? {
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assigneeId: task.assigneeId,
        gitBindings: structuredClone(task.gitBindings),
      }
    : {
        title: "",
        description: "",
        status: "backlog",
        priority: "normal",
        assigneeId: null,
        gitBindings: [],
      };
}

/** Обновление props не перезаписывает draft: новую серверную ревизию пользователь загружает явно. */
export function useTaskEditor(props: TaskEditorProps) {
  const [initial, setInitial] = useState(() => editable(props.task));
  const [draft, setDraft] = useState(initial);
  const [revision, setRevision] = useState(props.task?.revision ?? null);
  const [discard, setDiscard] = useState<"close" | "reload" | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<TaskManagerClientError | null>(
    null,
  );
  const {
    submit,
    pending,
    error: mutationError,
    errorRef,
    setError,
  } = useTaskMutation(
    async (
      input: { fields: TaskEditableFields; revision: number | null },
      key: string,
    ) => props.onSave(input.fields, input.revision, key),
  );
  const error = reloadError ?? mutationError;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const fieldErrors = error?.fieldErrors ?? {};
  const unknownOutcome = Boolean(
    mutationError &&
    (mutationError.status === 0 ||
      mutationError.status >= 500 ||
      mutationError.code === "invalid_response"),
  );

  function change(patch: Partial<TaskEditableFields>) {
    if (pending || unknownOutcome) return;
    setDraft((current) => ({ ...current, ...patch }));
  }
  async function save() {
    setReloadError(null);
    const input =
      revision === null
        ? { ...draft, projectId: props.projectId, listId: props.listId }
        : { ...draft, expectedRevision: revision };
    const parsed = (
      revision === null ? taskCreateSchema : taskUpdateSchema
    ).safeParse(input);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues)
        (errors[issue.path.join(".")] ??= []).push(issue.message);
      setError(
        new TaskManagerClientError(
          "Проверьте поля задачи.",
          "validation_error",
          400,
          errors,
        ),
      );
      return;
    }
    const result = await submit({ fields: draft, revision });
    if (result) props.onClose();
  }
  function close() {
    if (pending || reloading || unknownOutcome) return;
    if (dirty) setDiscard("close");
    else props.onClose();
  }
  async function reload() {
    if (!props.task) return;
    setReloading(true);
    setReloadError(null);
    try {
      const latest = await props.onReload(props.task.id);
      const latestFields = editable(latest);
      setInitial(latestFields);
      setDraft(latestFields);
      setRevision(latest.revision);
      setError(null);
      setDiscard(null);
    } catch (cause) {
      setReloadError(
        cause instanceof TaskManagerClientError
          ? cause
          : new TaskManagerClientError(
              "Не удалось загрузить актуальную задачу.",
              "network_error",
              0,
            ),
      );
    } finally {
      setReloading(false);
    }
  }
  return {
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
    conflict: mutationError?.status === 409,
    pending,
    error,
    errorRef,
  };
}
