/**
 * @file tests/int/task-manager-durable-client.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-11
 * @description Проверяет повторную доставку, конфликт draft и подавление устаревших ответов Task Manager.
 * @see documentation/specifications/task-management-execution.md
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  TaskDto,
  TaskParticipantDto,
  TaskProjectDto,
} from "@realize/payload-task-manager/contracts";
import { TaskManagerApi } from "../../src/components/admin/task-manager/TaskManagerApi.adapter";
import { TaskManagerClientError } from "../../src/components/admin/task-manager/TaskManagerClient.error";
import type {
  TaskEditorProps,
  TaskManagerTransport,
} from "../../src/components/admin/task-manager/TaskManager.types";
import { useTaskEditor } from "../../src/components/admin/task-manager/useTaskEditor.hook";
import { useTaskManager } from "../../src/components/admin/task-manager/useTaskManager.hook";
import { useTaskMutation } from "../../src/components/admin/task-manager/useTaskMutation.hook";

const actor: TaskParticipantDto = { id: "42", name: "Участник" };
const projectId = "34bcdf12-fbab-4e65-8e98-bd761b61252e";
const listId = "71cad5b8-05fa-49a5-b6fd-c78a47c5e8dc";
const taskId = "87a861a7-2a21-476e-a208-e6e870d6015d";
const otherId = "c137a51a-a3ac-4fdf-b925-81b2d727ca11";
const timestamp = "2026-10-11T12:00:00.000Z";
const task: TaskDto = {
  id: taskId,
  key: "TASK-1",
  projectId,
  listId,
  title: "Исходное задание",
  description: "Описание",
  status: "backlog",
  priority: "normal",
  assigneeId: actor.id,
  gitBindings: [],
  revision: 1,
  createdBy: actor.id,
  updatedBy: actor.id,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const project: TaskProjectDto = {
  id: projectId,
  title: "Проект",
  description: "",
  ownerId: actor.id,
  memberIds: [],
  revision: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const page = <T>(items: T[]) => ({ items, nextCursor: null });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function transport(): TaskManagerTransport {
  return {
    projects: vi.fn().mockResolvedValue(page([project])),
    lists: vi.fn().mockResolvedValue(
      page([
        {
          id: listId,
          projectId,
          title: "Задачи",
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]),
    ),
    participants: vi.fn().mockResolvedValue(page([actor])),
    tasks: vi.fn().mockResolvedValue(page([task])),
    task: vi.fn().mockResolvedValue(task),
    events: vi.fn().mockResolvedValue(page([])),
    createProject: vi.fn().mockResolvedValue(project),
    createTask: vi.fn().mockResolvedValue(task),
    updateTask: vi.fn().mockResolvedValue({ ...task, revision: 2 }),
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Постоянный Task Manager: клиентские границы", () => {
  it("не создаёт новый Idempotency-Key после неизвестного исхода неизменённой команды", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection lost"))
      .mockResolvedValueOnce(task);
    const { result } = renderHook(() =>
      useTaskMutation<{ title: string }, TaskDto>(save),
    );
    const fields = { title: "Задание" };
    await act(async () => {
      await result.current.submit(fields);
    });
    expect(result.current.error?.code).toBe("network_error");
    await act(async () => {
      await result.current.submit(fields);
    });
    expect(save.mock.calls[0][1]).toMatch(/^[a-f0-9-]{36}$/);
    expect(save.mock.calls[1][1]).toBe(save.mock.calls[0][1]);
  });

  it("не отправляет две concurrent mutations при повторном submit", async () => {
    const pending = deferred<TaskDto>();
    const save = vi.fn().mockReturnValue(pending.promise);
    const { result } = renderHook(() =>
      useTaskMutation<{ title: string }, TaskDto>(save),
    );
    let request: Promise<TaskDto | undefined>;
    act(() => {
      request = result.current.submit({ title: "Задание" });
    });
    await act(async () => {
      await result.current.submit({ title: "Задание" });
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(task);
      await request;
    });
  });

  it("сохраняет draft и baseline revision при409; новая версия загружается только явно", async () => {
    const latest = {
      ...task,
      title: "Изменено другим участником",
      revision: 2,
    };
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(
        new TaskManagerClientError(
          "Ревизия изменилась",
          "REVISION_CONFLICT",
          409,
        ),
      )
      .mockResolvedValueOnce({ ...latest, revision: 3 });
    const onClose = vi.fn();
    const props: TaskEditorProps = {
      task,
      projectId,
      listId,
      theme: "light",
      participants: [actor],
      moreParticipants: false,
      onMoreParticipants: vi.fn(),
      onClose,
      onSave,
      onReload: vi.fn().mockResolvedValue(latest),
    };
    const { result, rerender } = renderHook((input) => useTaskEditor(input), {
      initialProps: props,
    });
    act(() => result.current.change({ title: "Мой несохранённый текст" }));
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.draft.title).toBe("Мой несохранённый текст");
    expect(result.current.revision).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
    rerender({ ...props, task: latest });
    expect(result.current.draft.title).toBe("Мой несохранённый текст");
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.draft.title).toBe(latest.title);
    expect(result.current.revision).toBe(2);
    act(() => result.current.change({ title: "Мой несохранённый текст" }));
    await act(async () => {
      await result.current.save();
    });
    expect(onSave.mock.calls[0][1]).toBe(1);
    expect(onSave.mock.calls[1][1]).toBe(2);
    expect(onSave.mock.calls[1][2]).not.toBe(onSave.mock.calls[0][2]);
  });

  it("не показывает запоздавшую карточку после выбора другой задачи даже при ignored AbortSignal", async () => {
    const api = transport();
    const slow = deferred<TaskDto>();
    api.task = vi.fn().mockImplementation((id: string) =>
      id === taskId
        ? slow.promise
        : Promise.resolve({
            ...task,
            id: otherId,
            key: "TASK-2",
            title: "Другая задача",
          }),
    );
    const { result } = renderHook(() =>
      useTaskManager(
        {
          initialTheme: "light",
          themeCookieName: "payload-theme",
          currentActor: actor,
        },
        api,
      ),
    );
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    act(() => result.current.setSelectedId(taskId));
    await waitFor(() =>
      expect(api.task).toHaveBeenCalledWith(taskId, expect.any(AbortSignal)),
    );
    act(() => result.current.setSelectedId(otherId));
    await waitFor(() => expect(result.current.task?.id).toBe(otherId));
    await act(async () => {
      slow.resolve(task);
      await slow.promise;
    });
    expect(result.current.task?.id).toBe(otherId);
    act(() => result.current.setSelectedId(otherId));
    expect(result.current.task?.id).toBe(otherId);
    expect(result.current.detailLoading).toBe(false);
  });

  it("передаёт credentials, expectedRevision и Idempotency-Key и декодирует серверный409", async () => {
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "REVISION_CONFLICT",
            message: "Задача изменилась",
            fieldErrors: { title: ["Проверьте название"] },
          },
        }),
        { status: 409 },
      ),
    );
    const api = new TaskManagerApi(requestFetch);
    const {
      id: _id,
      key: _key,
      projectId: _project,
      listId: _list,
      revision: _revision,
      createdBy: _createdBy,
      updatedBy: _updatedBy,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...fields
    } = task;
    await expect(
      api.updateTask(taskId, { ...fields, expectedRevision: 1 }, otherId),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVISION_CONFLICT",
      fieldErrors: { title: ["Проверьте название"] },
    });
    expect(requestFetch).toHaveBeenCalledWith(
      `/api/task-manager/tasks/${taskId}`,
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": otherId,
        },
      }),
    );
    expect(
      JSON.parse(String(requestFetch.mock.calls[0][1]?.body)).expectedRevision,
    ).toBe(1);
  });

  it("запоздавшая история до mutation не заменяет историю сохранённой ревизии", async () => {
    const api = transport();
    const staleEvents =
      deferred<Awaited<ReturnType<TaskManagerTransport["events"]>>>();
    const event = {
      id: otherId,
      taskId,
      actorId: actor.id,
      kind: "updated" as const,
      revision: 2,
      occurredAt: timestamp,
      summary: "Сохранена новая ревизия",
    };
    api.events = vi
      .fn()
      .mockReturnValueOnce(staleEvents.promise)
      .mockResolvedValue(page([event]));
    const { result } = renderHook(() =>
      useTaskManager(
        {
          initialTheme: "light",
          themeCookieName: "payload-theme",
          currentActor: actor,
        },
        api,
      ),
    );
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    act(() => result.current.setSelectedId(taskId));
    await waitFor(() => expect(result.current.task?.id).toBe(taskId));
    act(() => result.current.setEditing(task));
    await act(async () => {
      await result.current.saveTask(
        {
          title: "Обновление",
          description: "",
          status: "review",
          priority: "high",
          assigneeId: actor.id,
          gitBindings: [],
        },
        1,
        otherId,
      );
    });
    expect(result.current.task?.revision).toBe(2);
    expect(result.current.events[0]?.revision).toBe(2);
    await act(async () => {
      staleEvents.resolve(
        page([
          {
            ...event,
            revision: 1,
            kind: "created",
            summary: "Предыдущая ревизия",
          },
        ]),
      );
      await staleEvents.promise;
    });
    expect(result.current.events[0]?.revision).toBe(2);
  });

  it("отклоняет ответ с raw или лишними полями вместо публичного DTO", async () => {
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { ...task, secret: "synthetic-extra-field" },
        }),
        { status: 200 },
      ),
    );
    await expect(
      new TaskManagerApi(requestFetch).task(taskId),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
