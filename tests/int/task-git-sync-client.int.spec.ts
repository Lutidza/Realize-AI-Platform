/**
 * @file tests/int/task-git-sync-client.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет восстановление снимков, повтор неизвестного результата и изоляцию task revision в клиенте.
 * @see documentation/specifications/task-management-execution.md
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  TaskGitSyncDto,
  TaskPageDto,
} from "@realize/payload-task-manager/contracts";
import { TaskManagerApi } from "../../src/components/admin/task-manager/TaskManagerApi.adapter";
import { useTaskGitSyncs } from "../../src/components/admin/task-manager/useTaskGitSyncs.hook";

const id = "87a861a7-2a21-476e-a208-e6e870d6015d";
const other = "c137a51a-a3ac-4fdf-b925-81b2d727ca11";
const timestamp = "2026-10-12T00:00:00.000Z";
const dto = (taskId = id, taskRevision = 1): TaskGitSyncDto => ({
  id: "e6e1a3e6-b85e-4d17-8cd9-cda1c5c5d334",
  projectId: other,
  actorId: "1",
  taskId,
  taskRevision,
  observedAt: timestamp,
  recordedAt: timestamp,
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
const transport = () => ({
  gitSyncs: vi.fn().mockResolvedValue({ items: [dto()], nextCursor: null }),
  syncGit: vi.fn().mockResolvedValue(dto()),
});
afterEach(cleanup);

describe("Долговечные Git-снимки в карточке", () => {
  it("восстанавливает receipt при открытии без обращения к provider", async () => {
    const api = transport();
    const { result } = renderHook(() =>
      useTaskGitSyncs({ id, revision: 1 }, api),
    );
    await waitFor(() => expect(result.current.selected).toEqual(dto()));
    expect(api.syncGit).not.toHaveBeenCalled();
    expect(api.gitSyncs).toHaveBeenCalledTimes(1);
  });

  it("повторяет неподтверждённую команду тем же UUID, затем создаёт новый UUID для нового polling", async () => {
    const api = transport();
    api.syncGit.mockRejectedValueOnce(new Error("closed internal diagnostic"));
    const { result } = renderHook(() =>
      useTaskGitSyncs({ id, revision: 1 }, api),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.sync());
    expect(result.current.retry).toBe(true);
    expect(result.current.syncError).not.toContain("diagnostic");
    await act(() => result.current.sync());
    expect(api.syncGit.mock.calls[1].slice(0, 3)).toEqual(
      api.syncGit.mock.calls[0].slice(0, 3),
    );
    expect(api.syncGit.mock.calls[0][1]).toEqual({ expectedRevision: 1 });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.retry).toBe(false);
    await act(() => result.current.sync());
    expect(api.syncGit.mock.calls[2][2]).not.toBe(api.syncGit.mock.calls[0][2]);
  });

  it("не показывает старую ревизию как текущую, сохраняя её в истории по явному выбору", async () => {
    const api = transport();
    const { result, rerender } = renderHook(
      (task) => useTaskGitSyncs(task, api),
      { initialProps: { id, revision: 1 } },
    );
    await waitFor(() => expect(result.current.selected).toEqual(dto()));
    rerender({ id, revision: 2 });
    expect(result.current.selected).toBeNull();
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.selected).toBeNull();
    act(() => result.current.select(dto().id));
    expect(result.current.selected?.taskRevision).toBe(1);
  });

  it("сохраняет замороженный повтор при смене ревизии той же задачи", async () => {
    const api = transport();
    api.syncGit.mockRejectedValueOnce(new Error("response lost"));
    const { result, rerender } = renderHook(
      (task) => useTaskGitSyncs(task, api),
      { initialProps: { id, revision: 1 } },
    );
    await waitFor(() => expect(result.current.selected).toEqual(dto()));
    await act(() => result.current.sync());
    rerender({ id, revision: 2 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.retry).toBe(true);
    await act(() => result.current.sync());
    expect(api.syncGit.mock.calls[1].slice(0, 3)).toEqual(
      api.syncGit.mock.calls[0].slice(0, 3),
    );
    expect(result.current.selected?.taskRevision).toBe(1);
  });

  it("поздняя первая страница не теряет сохранённый параллельно receipt после выбора старого снимка", async () => {
    const api = transport();
    const newer = { ...dto(), recordedAt: "2026-10-12T00:00:02.000Z" };
    const older = {
      ...dto(),
      id: other,
      recordedAt: "2026-10-12T00:00:01.000Z",
    };
    const saved = {
      ...dto(),
      id: "98f4f049-18ee-4369-a705-4104f4fe5604",
      recordedAt: "2026-10-12T00:00:03.000Z",
    };
    const page = { items: [newer, older], nextCursor: null };
    const pendingPage = deferred<TaskPageDto<TaskGitSyncDto>>();
    api.gitSyncs
      .mockResolvedValueOnce(page)
      .mockReturnValueOnce(pendingPage.promise);
    api.syncGit.mockResolvedValueOnce(saved);
    const { result } = renderHook(() =>
      useTaskGitSyncs({ id, revision: 1 }, api),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    let request!: Promise<void>;
    act(() => {
      request = result.current.load();
    });
    await act(() => result.current.sync());
    act(() => result.current.select(older.id));
    await act(async () => {
      pendingPage.resolve(page);
      await request;
    });
    expect(result.current.items.map((item) => item.id)).toEqual([
      saved.id,
      newer.id,
      older.id,
    ]);
    expect(result.current.selected?.id).toBe(older.id);
  });

  it("объединяет пересекающиеся страницы в порядке времени, сохраняя выбранный снимок", async () => {
    const api = transport();
    const newer = { ...dto(), recordedAt: "2026-10-12T00:00:03.000Z" };
    const middle = {
      ...dto(),
      id: other,
      recordedAt: "2026-10-12T00:00:02.000Z",
    };
    const older = {
      ...dto(),
      id: "98f4f049-18ee-4369-a705-4104f4fe5604",
      recordedAt: "2026-10-12T00:00:01.000Z",
    };
    api.gitSyncs
      .mockResolvedValueOnce({
        items: [newer, middle],
        nextCursor: "older-page",
      })
      .mockResolvedValueOnce({ items: [middle, older], nextCursor: null })
      .mockResolvedValueOnce({
        items: [newer, middle],
        nextCursor: "older-page",
      });
    const { result } = renderHook(() =>
      useTaskGitSyncs({ id, revision: 1 }, api),
    );
    await waitFor(() => expect(result.current.nextCursor).toBe("older-page"));
    act(() => result.current.select(middle.id));
    await act(() => result.current.load(result.current.nextCursor));
    expect(result.current.items.map((item) => item.id)).toEqual([
      newer.id,
      middle.id,
      older.id,
    ]);
    expect(result.current.selected?.id).toBe(middle.id);
    expect(result.current.nextCursor).toBeNull();
    await act(() => result.current.load());
    expect(result.current.items.map((item) => item.id)).toEqual([
      newer.id,
      middle.id,
    ]);
    expect(result.current.selected?.id).toBe(middle.id);
  });

  it("receipt старой принятой ревизии остаётся историческим и не сдвигает более новый снимок", async () => {
    const api = transport();
    const historical = { ...dto(), recordedAt: "2026-10-12T00:00:01.000Z" };
    const current = {
      ...dto(id, 2),
      id: other,
      recordedAt: "2026-10-12T00:00:02.000Z",
    };
    api.gitSyncs
      .mockResolvedValueOnce({ items: [historical], nextCursor: null })
      .mockResolvedValueOnce({
        items: [current, historical],
        nextCursor: null,
      });
    api.syncGit
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(historical);
    const { result, rerender } = renderHook(
      (task) => useTaskGitSyncs(task, api),
      { initialProps: { id, revision: 1 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.sync());
    rerender({ id, revision: 2 });
    await waitFor(() => expect(result.current.selected?.id).toBe(current.id));
    await act(() => result.current.sync());
    expect(api.syncGit.mock.calls[1].slice(0, 3)).toEqual(
      api.syncGit.mock.calls[0].slice(0, 3),
    );
    expect(result.current.items.map((item) => item.id)).toEqual([
      current.id,
      historical.id,
    ]);
    expect(result.current.selected?.taskRevision).toBe(1);
    expect(result.current.retry).toBe(false);
  });

  it("отменяет запись и не подменяет другой task поздним receipt", async () => {
    const api = transport();
    const pending = deferred<TaskGitSyncDto>();
    api.syncGit.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      (task) => useTaskGitSyncs(task, api),
      { initialProps: { id, revision: 1 } },
    );
    await waitFor(() => expect(result.current.selected).toEqual(dto()));
    let request!: Promise<void>;
    act(() => {
      request = result.current.sync();
    });
    const signal = api.syncGit.mock.calls[0][3] as AbortSignal;
    api.gitSyncs.mockResolvedValue({ items: [], nextCursor: null });
    rerender({ id: other, revision: 1 });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(dto());
      await request;
    });
    expect(result.current.selected).toBeNull();
    expect(result.current.saving).toBe(false);
  });

  it("не запускает два POST одновременно", async () => {
    const api = transport();
    const pending = deferred<TaskGitSyncDto>();
    api.syncGit.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() =>
      useTaskGitSyncs({ id, revision: 1 }, api),
    );
    await waitFor(() => expect(result.current.selected).toEqual(dto()));
    let request!: Promise<void>;
    act(() => {
      request = result.current.sync();
      void result.current.sync();
    });
    expect(api.syncGit).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(dto());
      await request;
    });
  });

  it("transport отправляет strict command и ключ; raw receipt отклоняется", async () => {
    const requestFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ok: true, data: dto() }));
    const api = new TaskManagerApi(requestFetch);
    expect(await api.syncGit(id, { expectedRevision: 1 }, other)).toEqual(
      dto(),
    );
    expect(requestFetch).toHaveBeenCalledWith(
      `/api/task-manager/tasks/${id}/git-syncs`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ expectedRevision: 1 }),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": other,
        },
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    requestFetch.mockResolvedValue(
      Response.json({ ok: true, data: { ...dto(), token: "closed" } }),
    );
    await expect(
      api.syncGit(id, { expectedRevision: 1 }, other),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
