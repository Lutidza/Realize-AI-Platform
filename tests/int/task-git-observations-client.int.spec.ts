/**
 * @file tests/int/task-git-observations-client.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет ручное чтение Git, отмену устаревших ответов и строгую границу клиента задач.
 * @see documentation/specifications/task-management-execution.md
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskGitObservationsDto } from "@realize/payload-task-manager/contracts";
import { TaskManagerApi } from "../../src/components/admin/task-manager/TaskManagerApi.adapter";
import { useTaskGitObservations } from "../../src/components/admin/task-manager/useTaskGitObservations.hook";

const id = "87a861a7-2a21-476e-a208-e6e870d6015d";
const other = "c137a51a-a3ac-4fdf-b925-81b2d727ca11";
const timestamp = "2026-10-12T00:00:00.000Z";
const dto = (taskId = id, taskRevision = 1): TaskGitObservationsDto => ({
  taskId,
  taskRevision,
  observedAt: timestamp,
  items: [],
  complete: true,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(cleanup);

describe("Чтение Git в карточке задачи", () => {
  it("не читает провайдера автоматически и запускает чтение только явно", async () => {
    const gitObservations = vi.fn().mockResolvedValue(dto());
    const { result } = renderHook(() =>
      useTaskGitObservations({ id, revision: 1 }, { gitObservations }),
    );
    expect(gitObservations).not.toHaveBeenCalled();
    await act(() => result.current.refresh());
    expect(gitObservations).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(dto());
  });

  it("скрывает прежние факты и игнорирует незавершённый ответ другой задачи", async () => {
    const pending = deferred<TaskGitObservationsDto>();
    const gitObservations = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(dto(other, 2));
    const { result, rerender } = renderHook(
      (task) => useTaskGitObservations(task, { gitObservations }),
      { initialProps: { id, revision: 1 } },
    );
    let request!: Promise<void>;
    act(() => {
      request = result.current.refresh();
    });
    expect(result.current.loading).toBe(true);
    const signal = gitObservations.mock.calls[0][1] as AbortSignal;
    rerender({ id: other, revision: 2 });
    expect(signal.aborted).toBe(true);
    expect(result.current.loading).toBe(false);
    await act(() => result.current.refresh());
    await act(async () => {
      pending.resolve(dto());
      await request;
    });
    expect(result.current.data).toEqual(dto(other, 2));
  });

  it("сбрасывает отображение после изменения ревизии и отклоняет чужую ревизию ответа", async () => {
    const gitObservations = vi.fn().mockResolvedValue(dto());
    const { result, rerender } = renderHook(
      (task) => useTaskGitObservations(task, { gitObservations }),
      { initialProps: { id, revision: 1 } },
    );
    await act(() => result.current.refresh());
    rerender({ id, revision: 2 });
    expect(result.current.data).toBeNull();
    await act(() => result.current.refresh());
    expect(result.current.data).toBeNull();
    expect(result.current.error).toContain("Задача изменилась");
  });

  it("не раскрывает сетевые исключения и позволяет повторить чтение", async () => {
    const gitObservations = vi
      .fn()
      .mockRejectedValueOnce(new Error("internal credential diagnostic"))
      .mockResolvedValueOnce(dto());
    const { result } = renderHook(() =>
      useTaskGitObservations({ id, revision: 1 }, { gitObservations }),
    );
    await act(() => result.current.refresh());
    expect(result.current.error).not.toContain("credential");
    expect(result.current.loading).toBe(false);
    await act(() => result.current.refresh());
    expect(result.current.error).toBe("");
    expect(result.current.data).toEqual(dto());
  });

  it("отменяет повторное чтение и сохраняет ответ последнего запроса", async () => {
    const pending = deferred<TaskGitObservationsDto>();
    const gitObservations = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({
        ...dto(),
        observedAt: "2026-10-12T01:00:00.000Z",
      });
    const { result } = renderHook(() =>
      useTaskGitObservations({ id, revision: 1 }, { gitObservations }),
    );
    let request!: Promise<void>;
    act(() => {
      request = result.current.refresh();
    });
    const signal = gitObservations.mock.calls[0][1] as AbortSignal;
    await act(() => result.current.refresh());
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(dto());
      await request;
    });
    expect(result.current.data?.observedAt).toBe("2026-10-12T01:00:00.000Z");
  });

  it("API использует no-store и отклоняет лишние закрытые поля DTO", async () => {
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ok: true,
        data: { ...dto(), credential: "closed field" },
      }),
    );
    const api = new TaskManagerApi(requestFetch);
    await expect(api.gitObservations(id)).rejects.toMatchObject({
      code: "invalid_response",
    });
    expect(requestFetch).toHaveBeenCalledWith(
      `/api/task-manager/tasks/${id}/git-observations`,
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
  });
});
