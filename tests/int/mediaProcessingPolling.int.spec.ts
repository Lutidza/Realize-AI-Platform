/**
 * @file tests/int/mediaProcessingPolling.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет остановку polling, отмену устаревшего чтения и единственный POST обработки.
 * @see documentation/specifications/media-management.md
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaProcessingStatusDTO } from "../../src/collections/Media/MediaProcessingStatus.types";
import { useMediaProcessing } from "../../src/components/admin/media/useMediaProcessing.hook";

const endpoint = "/custom-api/media/7/processing";
const status = (
  state: "queued" | "ready" = "ready",
): MediaProcessingStatusDTO => ({
  original: null,
  sets: [
    {
      id: 2,
      profileName: "Контент",
      profileVersion: 1,
      status: state,
      error: null,
      canRetry: false,
      createdAt: "2026-09-15T10:00:00Z",
      variants: [],
    },
  ],
  hasMore: false,
});
const response = (value: unknown, code = 200) =>
  ({
    ok: code >= 200 && code < 300,
    status: code,
    json: async () => value,
  }) as Response;

function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("media processing request lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls a queued set after five seconds and stops once ready", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(status("queued")))
      .mockResolvedValue(response(status()));
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(() => useMediaProcessing(endpoint));
    await act(async () => {});
    expect(hook.result.current.data?.sets[0]?.status).toBe("queued");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(hook.result.current.data?.sets[0]?.status).toBe("ready");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts a previous page and ignores its late response", async () => {
    const first = deferred();
    const pageTwo = { ...status(), sets: [{ ...status().sets[0]!, id: 3 }] };
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(response(pageTwo));
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(() => useMediaProcessing(endpoint));
    const firstSignal = fetch.mock.calls[0]![1].signal as AbortSignal;
    await act(async () => {
      hook.result.current.changePage(2);
    });
    expect(firstSignal.aborted).toBe(true);
    expect(fetch.mock.calls[1]![0]).toBe(`${endpoint}?page=2`);
    await act(async () => {
      first.resolve(response(status("queued")));
    });
    expect(hook.result.current.data?.sets[0]?.id).toBe(3);
    expect(hook.result.current.page).toBe(2);
  });

  it("sends one authenticated explicit queue POST despite a repeated click", async () => {
    const post = deferred();
    const fetch = vi
      .fn()
      .mockImplementation((_url: string, options: RequestInit) =>
        options.method === "POST"
          ? post.promise
          : Promise.resolve(response(status())),
      );
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(() => useMediaProcessing(endpoint));
    await act(async () => {});
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.queue();
      void hook.result.current.queue();
    });
    const posts = fetch.mock.calls.filter((call) => call[1].method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject([
      endpoint,
      {
        body: "{}",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      },
    ]);
    await act(async () => {
      post.resolve(response({}, 201));
      await pending;
    });
    expect(hook.result.current.isMutating).toBe(false);
    expect(fetch.mock.calls.at(-1)?.[0]).toBe(`${endpoint}?page=1`);
  });

  it("cancels active reads and writes when the field is unmounted", () => {
    const fetch = vi.fn().mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(() => useMediaProcessing(endpoint));
    act(() => {
      void hook.result.current.retry(12);
    });
    expect(fetch.mock.calls[1]![0]).toBe(`${endpoint}/12/retry`);
    hook.unmount();
    expect(fetch.mock.calls.every((call) => call[1].signal.aborted)).toBe(true);
  });

  it("shows a server conflict without an automatic retry or write", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response({ error: "Сохраните профиль перед обработкой." }, 409),
      );
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(() => useMediaProcessing(endpoint));
    await act(async () => {});
    expect(hook.result.current.error).toBe(
      "Сохраните профиль перед обработкой.",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
