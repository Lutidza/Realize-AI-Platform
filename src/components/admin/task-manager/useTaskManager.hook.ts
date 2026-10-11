/**
 * @file src/components/admin/task-manager/useTaskManager.hook.ts
 * @version 1.1.0
 * @date 2026-10-11
 * @description Загружает постоянные задачи и подавляет ответы устаревшего выбранного контекста.
 * @see documentation/specifications/task-management-execution.md
 */
"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  TaskDto,
  TaskEditableFields,
  TaskEventDto,
  TaskListDto,
  TaskParticipantDto,
  TaskProjectCreateInput,
  TaskProjectDto,
} from "@realize/payload-task-manager/contracts";
import { taskManagerApi } from "./TaskManagerApi.adapter";
import { useSystemAdminTheme } from "../system-shell/useSystemAdminTheme.hook";
import type {
  TaskManagerTransport,
  TaskManagerWorkbenchProps,
} from "./TaskManager.types";

function append<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const entries = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const existing = entries.get(item.id);
    if (
      existing &&
      "revision" in existing &&
      "revision" in item &&
      Number(existing.revision) > Number(item.revision)
    )
      continue;
    entries.set(item.id, item);
  }
  return [...entries.values()];
}
function message(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Не удалось загрузить данные. Повторите запрос.";
}

/** Отдельный DTO/state не подключает fixture reducer и не наделяет UI полномочиями runtime. */
export function useTaskManager(
  props: TaskManagerWorkbenchProps,
  api: TaskManagerTransport = taskManagerApi,
) {
  const { theme, setTheme } = useSystemAdminTheme(props);
  const [projects, setProjects] = useState<TaskProjectDto[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [lists, setLists] = useState<TaskListDto[]>([]);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [listId, setListId] = useState("");
  const [participants, setParticipants] = useState<TaskParticipantDto[]>([
    props.currentActor,
  ]);
  const [participantCursor, setParticipantCursor] = useState<string | null>(
    null,
  );
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [taskCursor, setTaskCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskDto | null>(null);
  const [events, setEvents] = useState<TaskEventDto[]>([]);
  const [eventCursor, setEventCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listsLoading, setListsLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [paging, setPaging] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  // undefined: closed; null: create; TaskDto: frozen editing baseline.
  const [editing, setEditing] = useState<TaskDto | null | undefined>(undefined);
  const [refresh, setRefresh] = useState(0);
  const current = useRef({ projectId, listId, selectedId });
  useLayoutEffect(() => {
    current.current = { projectId, listId, selectedId };
  }, [projectId, listId, selectedId]);
  const mounted = useRef(true);
  const pagingBusy = useRef(false);
  const detailEpoch = useRef(0);
  const actorId = props.currentActor.id;
  const actorName = props.currentActor.name;

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void Promise.all([
      api.projects(null, controller.signal),
      api.participants(null, controller.signal),
    ])
      .then(([projectPage, participantPage]) => {
        if (controller.signal.aborted) return;
        setProjects(projectPage.items);
        setProjectCursor(projectPage.nextCursor);
        setParticipants(
          append([{ id: actorId, name: actorName }], participantPage.items),
        );
        setParticipantCursor(participantPage.nextCursor);
        setListsLoading(Boolean(projectPage.items[0]));
        setProjectId((selected) => selected || projectPage.items[0]?.id || "");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [api, actorId, actorName, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    if (!projectId) {
      return () => controller.abort();
    }
    void api
      .lists(projectId, null, controller.signal)
      .then((page) => {
        if (
          controller.signal.aborted ||
          current.current.projectId !== projectId
        )
          return;
        setLists(page.items);
        setListCursor(page.nextCursor);
        setTasksLoading(Boolean(page.items[0]));
        setListId(page.items[0]?.id ?? "");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setListsLoading(false);
      });
    return () => controller.abort();
  }, [api, projectId]);

  useEffect(() => {
    const controller = new AbortController();
    if (!projectId || !listId) {
      return () => controller.abort();
    }
    void api
      .tasks(projectId, listId, null, controller.signal)
      .then((page) => {
        if (
          controller.signal.aborted ||
          current.current.projectId !== projectId ||
          current.current.listId !== listId
        )
          return;
        setTasks(page.items);
        setTaskCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setTasksLoading(false);
      });
    return () => controller.abort();
  }, [api, projectId, listId]);

  useEffect(() => {
    const controller = new AbortController();
    const epoch = detailEpoch.current;
    if (!selectedId) {
      return () => controller.abort();
    }
    void api
      .task(selectedId, controller.signal)
      .then((record) => {
        if (
          !controller.signal.aborted &&
          current.current.selectedId === selectedId &&
          detailEpoch.current === epoch
        )
          setTask(record);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && detailEpoch.current === epoch)
          setError(message(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted && detailEpoch.current === epoch)
          setDetailLoading(false);
      });
    void api
      .events(selectedId, null, controller.signal)
      .then((page) => {
        if (
          !controller.signal.aborted &&
          current.current.selectedId === selectedId &&
          detailEpoch.current === epoch
        ) {
          setEvents(page.items);
          setEventCursor(page.nextCursor);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && detailEpoch.current === epoch)
          setError(message(cause));
      });
    return () => controller.abort();
  }, [api, selectedId]);

  async function more(
    kind: "projects" | "lists" | "participants" | "tasks" | "events",
  ) {
    if (pagingBusy.current) return;
    const context = { ...current.current };
    const cursor = {
      projects: projectCursor,
      lists: listCursor,
      participants: participantCursor,
      tasks: taskCursor,
      events: eventCursor,
    }[kind];
    if (!cursor) return;
    pagingBusy.current = true;
    setPaging(kind);
    if (kind === "events") setEventsLoading(true);
    try {
      if (kind === "projects") {
        const page = await api.projects(cursor);
        if (mounted.current) {
          setProjects((items) => append(items, page.items));
          setProjectCursor(page.nextCursor);
        }
      } else if (kind === "participants") {
        const page = await api.participants(cursor);
        if (mounted.current) {
          setParticipants((items) => append(items, page.items));
          setParticipantCursor(page.nextCursor);
        }
      } else if (kind === "lists") {
        const page = await api.lists(context.projectId, cursor);
        if (
          mounted.current &&
          current.current.projectId === context.projectId
        ) {
          setLists((items) => append(items, page.items));
          setListCursor(page.nextCursor);
        }
      } else if (kind === "tasks") {
        const page = await api.tasks(context.projectId, context.listId, cursor);
        if (
          mounted.current &&
          current.current.projectId === context.projectId &&
          current.current.listId === context.listId
        ) {
          setTasks((items) => append(items, page.items));
          setTaskCursor(page.nextCursor);
        }
      } else if (context.selectedId) {
        const page = await api.events(context.selectedId, cursor);
        if (
          mounted.current &&
          current.current.selectedId === context.selectedId
        ) {
          setEvents((items) => append(items, page.items));
          setEventCursor(page.nextCursor);
        }
      }
    } catch (cause) {
      if (
        mounted.current &&
        current.current.projectId === context.projectId &&
        current.current.listId === context.listId &&
        current.current.selectedId === context.selectedId
      )
        setError(message(cause));
    } finally {
      pagingBusy.current = false;
      if (mounted.current) {
        setPaging(null);
        setEventsLoading(false);
      }
    }
  }

  async function createProject(input: TaskProjectCreateInput, key: string) {
    const record = await api.createProject(input, key);
    if (mounted.current) {
      setProjects((items) => append(items, [record]));
      selectProject(record.id);
      setError("");
      setNotice(`Проект «${record.title}» создан.`);
    }
    return record;
  }

  async function saveTask(
    fields: TaskEditableFields,
    expectedRevision: number | null,
    key: string,
  ) {
    const context = { ...current.current };
    const record =
      editing && expectedRevision !== null
        ? await api.updateTask(editing.id, { ...fields, expectedRevision }, key)
        : await api.createTask(
            { ...fields, projectId: context.projectId, listId: context.listId },
            key,
          );
    if (
      mounted.current &&
      current.current.projectId === record.projectId &&
      current.current.listId === record.listId
    ) {
      setTasks((items) => append(items, [record]));
      if (current.current.selectedId !== record.id) selectTask(record.id);
      else detailEpoch.current += 1;
      setTask(record);
      setDetailLoading(false);
      setNotice(`${record.key}: изменения сохранены.`);
      setError("");
      const epoch = detailEpoch.current;
      void api
        .events(record.id)
        .then((page) => {
          if (
            mounted.current &&
            current.current.selectedId === record.id &&
            detailEpoch.current === epoch
          ) {
            setEvents(page.items);
            setEventCursor(page.nextCursor);
          }
        })
        .catch((cause: unknown) => {
          if (
            mounted.current &&
            current.current.selectedId === record.id &&
            detailEpoch.current === epoch
          )
            setError(message(cause));
        });
    }
    return record;
  }

  async function reloadTask(id: string) {
    const record = await api.task(id);
    if (mounted.current && current.current.selectedId === id) {
      setTask(record);
      setTasks((items) => append(items, [record]));
    }
    return record;
  }

  function selectProject(id: string) {
    if (current.current.projectId === id) return;
    current.current = { projectId: id, listId: "", selectedId: null };
    detailEpoch.current += 1;
    setProjectId(id);
    setListId("");
    setSelectedId(null);
    setLists([]);
    setListCursor(null);
    setListsLoading(Boolean(id));
    setTasks([]);
    setTaskCursor(null);
    setTasksLoading(false);
    setTask(null);
    setEvents([]);
    setEventCursor(null);
    setDetailLoading(false);
    setError("");
    setNotice("");
  }
  function selectList(id: string) {
    if (current.current.listId === id) return;
    current.current = { ...current.current, listId: id, selectedId: null };
    detailEpoch.current += 1;
    setListId(id);
    setSelectedId(null);
    setTasks([]);
    setTaskCursor(null);
    setTasksLoading(Boolean(id));
    setTask(null);
    setEvents([]);
    setEventCursor(null);
    setDetailLoading(false);
    setError("");
    setNotice("");
  }
  function selectTask(id: string | null) {
    if (current.current.selectedId === id) return;
    current.current = { ...current.current, selectedId: id };
    detailEpoch.current += 1;
    setSelectedId(id);
    setTask(null);
    setEvents([]);
    setEventCursor(null);
    setDetailLoading(Boolean(id));
  }
  const project = projects.find((item) => item.id === projectId);
  const list = lists.find((item) => item.id === listId);
  const canWrite = Boolean(
    project &&
    (project.ownerId === props.currentActor.id ||
      project.memberIds.includes(props.currentActor.id)),
  );
  return {
    theme,
    setTheme,
    projects,
    projectCursor,
    projectId,
    project,
    lists,
    listId,
    list,
    listCursor,
    participants,
    participantCursor,
    tasks,
    taskCursor,
    task,
    events,
    eventCursor,
    loading,
    listsLoading,
    tasksLoading,
    detailLoading,
    eventsLoading,
    paging,
    error,
    notice,
    selectedId,
    setSelectedId: selectTask,
    projectOpen,
    setProjectOpen,
    editing,
    setEditing,
    canWrite,
    selectProject,
    selectList,
    more,
    createProject,
    saveTask,
    reloadTask,
    retry: () => {
      setLoading(true);
      setError("");
      setRefresh((value) => value + 1);
      selectProject("");
    },
  };
}
