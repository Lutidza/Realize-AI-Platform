/**
 * @file src/components/admin/task-manager/useTaskGitObservations.hook.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Читает Git по явному действию и скрывает результаты чужой или изменившейся задачи.
 * @see documentation/specifications/task-management-execution.md
 */
"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { TaskDto } from "@realize/payload-task-manager/contracts";
import { taskManagerApi } from "./TaskManagerApi.adapter";
import { TaskManagerClientError } from "./TaskManagerClient.error";
import type { TaskManagerTransport } from "./TaskManager.types";
import type { TaskGitObservationState } from "./TaskGitObservations.types";

/** Ошибка Git не влияет на CRUD; при смене ревизии старые сведения исчезают сразу. */
export function useTaskGitObservations(
  task: Pick<TaskDto, "id" | "revision">,
  api: Pick<TaskManagerTransport, "gitObservations"> = taskManagerApi,
) {
  const [state, setState] = useState<TaskGitObservationState | null>(null);
  const epoch = useRef(0);
  const abort = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    epoch.current += 1;
    abort.current?.abort();
    return () => {
      epoch.current += 1;
      abort.current?.abort();
    };
  }, [task.id, task.revision]);
  const refresh = useCallback(async () => {
    const request = ++epoch.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const context = { taskId: task.id, revision: task.revision };
    setState({ ...context, data: null, error: "", loading: true });
    try {
      const data = await api.gitObservations(task.id, controller.signal);
      if (request !== epoch.current || controller.signal.aborted) return;
      if (data.taskId !== task.id || data.taskRevision !== task.revision)
        throw new TaskManagerClientError(
          "Задача изменилась. Закройте и снова откройте карточку перед проверкой Git.",
          "REVISION_CONFLICT",
          409,
        );
      setState({ ...context, data, error: "", loading: false });
    } catch (cause) {
      if (request !== epoch.current || controller.signal.aborted) return;
      setState({
        ...context,
        data: null,
        error:
          cause instanceof TaskManagerClientError
            ? cause.status === 409
              ? "Задача изменилась. Закройте и снова откройте карточку перед проверкой Git."
              : cause.message
            : "Не удалось получить сведения Git. Повторите проверку.",
        loading: false,
      });
    }
  }, [task.id, task.revision, api]);
  const current =
    state?.taskId === task.id && state.revision === task.revision
      ? state
      : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? "",
    loading: current?.loading ?? false,
    refresh,
  };
}
