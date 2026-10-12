/**
 * @file src/components/admin/task-manager/useTaskGitSyncs.hook.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Восстанавливает сохранённые Git-снимки и повторяет неизвестный результат тем же ключом.
 * @see documentation/specifications/task-management-execution.md
 */
"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { TaskDto } from "@realize/payload-task-manager/contracts";
import { taskManagerApi } from "./TaskManagerApi.adapter";
import { TaskManagerClientError } from "./TaskManagerClient.error";
import type { TaskManagerTransport } from "./TaskManager.types";
import type {
  TaskGitSyncClientState,
  TaskGitSyncPendingCommand,
} from "./TaskGitSyncs.types";

function mergeSyncs(
  retained: TaskGitSyncClientState["items"],
  page: TaskGitSyncClientState["items"],
): TaskGitSyncClientState["items"] {
  const byId = new Map<string, TaskGitSyncClientState["items"][number]>();
  for (const item of [...retained, ...page])
    if (!byId.has(item.id)) byId.set(item.id, item);
  // Публичный DTO не содержит storage PK: время задаёт порядок, UUID — стабильную ничью.
  return [...byId.values()].sort(
    (left, right) =>
      Date.parse(right.recordedAt) - Date.parse(left.recordedAt) ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
}

/** При загрузке карточки читается только БД. Provider вызывается явной командой пользователя. */
export function useTaskGitSyncs(
  task: Pick<TaskDto, "id" | "revision">,
  api: Pick<TaskManagerTransport, "gitSyncs" | "syncGit"> = taskManagerApi,
) {
  const [state, setState] = useState<TaskGitSyncClientState | null>(null);
  const epoch = useRef(0);
  const historyAbort = useRef<AbortController | null>(null);
  const syncAbort = useRef<AbortController | null>(null);
  const pending = useRef<TaskGitSyncPendingCommand | null>(null);
  const saving = useRef(false);
  const savedTaskId = useRef(task.id);
  const saveSequence = useRef(0);
  const savedReceipts = useRef(new Map<string, number>());
  const empty = useCallback(
    (): TaskGitSyncClientState => ({
      taskId: task.id,
      revision: task.revision,
      items: [],
      nextCursor: null,
      selectedId: null,
      historyError: "",
      syncError: "",
      loading: false,
      saving: false,
      retry: pending.current?.taskId === task.id,
    }),
    [task.id, task.revision],
  );
  const normalize = useCallback(
    (previous: TaskGitSyncClientState | null): TaskGitSyncClientState =>
      previous?.taskId === task.id && previous.revision === task.revision
        ? previous
        : empty(),
    [task.id, task.revision, empty],
  );
  useLayoutEffect(() => {
    epoch.current += 1;
    historyAbort.current?.abort();
    syncAbort.current?.abort();
    // Новая ревизия той же задачи не отменяет неизвестный исход уже отправленной команды.
    if (pending.current?.taskId !== task.id) pending.current = null;
    if (savedTaskId.current !== task.id) {
      savedTaskId.current = task.id;
      saveSequence.current = 0;
      savedReceipts.current.clear();
    }
    saving.current = false;
    return () => {
      epoch.current += 1;
      historyAbort.current?.abort();
      syncAbort.current?.abort();
    };
  }, [task.id, task.revision]);

  const load = useCallback(
    async (after: string | null = null) => {
      const requestEpoch = epoch.current;
      const savedBeforeRequest = saveSequence.current;
      historyAbort.current?.abort();
      const controller = new AbortController();
      historyAbort.current = controller;
      setState((previous) => ({
        ...normalize(previous),
        loading: true,
        historyError: "",
      }));
      try {
        const page = await api.gitSyncs(task.id, after, controller.signal);
        if (requestEpoch !== epoch.current || controller.signal.aborted) return;
        if (page.items.some((item) => item.taskId !== task.id))
          throw new Error("Wrong task receipt");
        setState((previous) => {
          const current = normalize(previous);
          // Сохранение могло завершиться параллельно с GET: новый receipt не теряется.
          const retained = after
            ? current.items
            : current.items.filter(
                (item) =>
                  item.id === current.selectedId ||
                  (savedReceipts.current.get(item.id) ?? 0) >
                    savedBeforeRequest,
              );
          const items = mergeSyncs(retained, page.items);
          return {
            ...current,
            items,
            nextCursor: page.nextCursor,
            loading: false,
          };
        });
      } catch (cause) {
        if (requestEpoch !== epoch.current || controller.signal.aborted) return;
        setState((previous) => ({
          ...normalize(previous),
          loading: false,
          historyError:
            cause instanceof TaskManagerClientError
              ? cause.message
              : "Не удалось загрузить историю Git. Повторите загрузку.",
        }));
      }
    },
    [task.id, api, normalize],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const sync = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    const requestEpoch = epoch.current;
    const command = pending.current ?? {
      taskId: task.id,
      revision: task.revision,
      key: crypto.randomUUID(),
    };
    pending.current = command;
    const controller = new AbortController();
    syncAbort.current = controller;
    setState((previous) => ({
      ...normalize(previous),
      saving: true,
      syncError: "",
    }));
    try {
      const data = await api.syncGit(
        command.taskId,
        { expectedRevision: command.revision },
        command.key,
        controller.signal,
      );
      if (requestEpoch !== epoch.current || controller.signal.aborted) return;
      if (data.taskId !== task.id || data.taskRevision !== command.revision)
        throw new Error("Wrong sync receipt");
      pending.current = null;
      savedReceipts.current.set(data.id, ++saveSequence.current);
      setState((previous) => {
        const current = normalize(previous);
        return {
          ...current,
          items: mergeSyncs([data], current.items),
          selectedId: data.id,
          saving: false,
          retry: false,
          syncError: "",
        };
      });
    } catch (cause) {
      if (requestEpoch !== epoch.current || controller.signal.aborted) return;
      // Даже 5xx/обрыв ответа может следовать после commit. До подтверждения ключ сохраняется.
      const conflict =
        cause instanceof TaskManagerClientError && cause.status === 409;
      setState((previous) => ({
        ...normalize(previous),
        saving: false,
        retry: true,
        syncError: conflict
          ? "Задача изменилась. Закройте и снова откройте карточку перед синхронизацией Git."
          : cause instanceof TaskManagerClientError && cause.status < 500
            ? cause.message
            : "Результат синхронизации не подтверждён. Повтор отправит ту же команду.",
      }));
    } finally {
      if (requestEpoch === epoch.current) saving.current = false;
    }
  }, [task.id, task.revision, api, normalize]);

  const current =
    state?.taskId === task.id && state.revision === task.revision
      ? state
      : empty();
  const selected =
    current.items.find((item) => item.id === current.selectedId) ??
    current.items.find((item) => item.taskRevision === task.revision) ??
    null;
  const select = (id: string) =>
    setState((previous) => {
      const selectedState = normalize(previous);
      return selectedState.items.some((item) => item.id === id)
        ? { ...selectedState, selectedId: id }
        : selectedState;
    });
  return { ...current, selected, sync, load, select };
}
