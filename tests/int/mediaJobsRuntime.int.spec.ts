/**
 * @file tests/int/mediaJobsRuntime.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет singleton, завершение и ограниченное восстановление native Media Jobs без БД.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import { setTimeout as delay } from "node:timers/promises";
import type { Payload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acquireMediaJobsLock } from "../../scripts/runtime/acquireMediaJobsLock.service";
import { createMediaJobsRuntime } from "../../scripts/runtime/createMediaJobsRuntime.adapter";
import { runMediaJobs } from "../../scripts/runtime/runMediaJobs.service";
import type { MediaJobsRunnerOptions } from "../../scripts/runtime/MediaJobsRuntime.types";

const postgres = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  listeners: new Map<string, () => void>(),
}));
vi.mock("pg", () => ({
  Client: class {
    connect = postgres.connect;
    query = postgres.query;
    end = postgres.end;
    on(event: string, listener: () => void) {
      postgres.listeners.set(event, listener);
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  postgres.listeners.clear();
  postgres.connect.mockResolvedValue(undefined);
  postgres.end.mockResolvedValue(undefined);
  postgres.query.mockResolvedValue({ rows: [{ acquired: true }] });
});

const fixture = () => {
  const signal = new AbortController();
  const events: string[] = [];
  const assertHeld = vi.fn(async () => {
    events.push("assert");
  });
  const release = vi.fn(async () => {
    events.push("release");
  });
  const recover = vi.fn(async () => {
    events.push("recover");
    return { recovered: 1, failed: 0 };
  });
  const run = vi.fn(async () => {
    events.push("run");
    signal.abort();
  });
  const close = vi.fn(async () => {
    events.push("close");
  });
  const initialize = vi.fn(async () => {
    events.push("initialize");
    return { recover, run, close };
  });
  const acquireLock = vi.fn(async () => {
    events.push("lock");
    return { assertHeld, release };
  });
  const options: MediaJobsRunnerOptions = {
    databaseUrl: "postgresql://unused.invalid/fixture",
    signal: signal.signal,
    initialize,
    acquireLock,
    onLockLost: vi.fn(),
    intervalMs: 5,
    log: () => undefined,
  };
  return {
    signal,
    events,
    assertHeld,
    release,
    recover,
    run,
    close,
    initialize,
    acquireLock,
    options,
  };
};

describe("native Media runner lifecycle", () => {
  it("acquires ownership before initialization/recovery and releases it after runtime close", async () => {
    const context = fixture();
    await runMediaJobs(context.options);
    expect(context.events).toEqual([
      "lock",
      "initialize",
      "assert",
      "recover",
      "assert",
      "run",
      "close",
      "release",
    ]);
  });

  it("never overlaps jobs or releases the lock during graceful drain", async () => {
    const context = fixture();
    const started = Promise.withResolvers<void>();
    const active = Promise.withResolvers<void>();
    context.run.mockImplementation(async () => {
      started.resolve();
      await active.promise;
    });
    const running = runMediaJobs(context.options);
    await started.promise;
    await delay(25);
    expect(context.run).toHaveBeenCalledTimes(1);
    context.signal.abort();
    await delay(10);
    expect(context.close).not.toHaveBeenCalled();
    expect(context.release).not.toHaveBeenCalled();
    active.resolve();
    await running;
    expect(context.events.slice(-2)).toEqual(["close", "release"]);
    expect(context.run).toHaveBeenCalledTimes(1);
  });

  it("wakes from idle on abort instead of waiting for the next polling interval", async () => {
    const context = fixture();
    context.options.intervalMs = 60_000;
    context.run.mockResolvedValue(undefined);
    const running = runMediaJobs(context.options);
    await vi.waitFor(() => expect(context.run).toHaveBeenCalledTimes(1));
    await delay(10);
    context.signal.abort();
    await running;
    expect(context.close).toHaveBeenCalledOnce();
  }, 2_000);

  it("does not initialize without ownership and releases ownership on initialization failure", async () => {
    const first = fixture();
    first.acquireLock.mockRejectedValue(new Error("already owned"));
    await expect(runMediaJobs(first.options)).rejects.toThrow("already owned");
    expect(first.initialize).not.toHaveBeenCalled();
    const second = fixture();
    second.initialize.mockRejectedValue(new Error("configuration unavailable"));
    await expect(runMediaJobs(second.options)).rejects.toThrow(
      "configuration unavailable",
    );
    expect(second.release).toHaveBeenCalledOnce();
  });

  it("does not retry a broken native run loop or run after lock verification fails", async () => {
    const first = fixture();
    first.run.mockRejectedValue(new Error("database unavailable"));
    await expect(runMediaJobs(first.options)).rejects.toThrow(
      "database unavailable",
    );
    expect(first.run).toHaveBeenCalledOnce();
    expect(first.events.slice(-2)).toEqual(["close", "release"]);
    const second = fixture();
    second.assertHeld
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("lock lost"));
    await expect(runMediaJobs(second.options)).rejects.toThrow("lock lost");
    expect(second.run).not.toHaveBeenCalled();
  });

  it("does not acquire or recover anything for a stopped process", async () => {
    const context = fixture();
    context.signal.abort();
    await runMediaJobs(context.options);
    expect(context.acquireLock).not.toHaveBeenCalled();
  });
});

describe("Media advisory singleton", () => {
  it("uses the same database key without cwd, rejects the second owner and closes its connection", async () => {
    postgres.query.mockResolvedValue({ rows: [{ acquired: false }] });
    await expect(
      acquireMediaJobsLock("postgresql://unused.invalid/fixture", vi.fn()),
    ).rejects.toThrow("уже запущен");
    expect(postgres.query).toHaveBeenCalledWith(
      "SELECT pg_try_advisory_lock(hashtext('realize-media-jobs'), hashtext('media')) AS acquired",
    );
    expect(postgres.end).toHaveBeenCalledOnce();
  });

  it("signals loss once, refuses further work and ignores expected close events", async () => {
    const lost = vi.fn();
    const lock = await acquireMediaJobsLock(
      "postgresql://unused.invalid/fixture",
      lost,
    );
    postgres.listeners.get("error")?.();
    postgres.listeners.get("end")?.();
    expect(lost).toHaveBeenCalledOnce();
    await expect(lock.assertHeld()).rejects.toThrow("потеряна");
    await lock.release();
    const expectedClose = vi.fn();
    const nextLock = await acquireMediaJobsLock(
      "postgresql://unused.invalid/fixture",
      expectedClose,
    );
    await nextLock.release();
    postgres.listeners.get("end")?.();
    expect(expectedClose).not.toHaveBeenCalled();
  });
});

describe("native Media Jobs adapter", () => {
  it("only recovers own unfinished jobs, preserves native retry history and stops after three recoveries", async () => {
    const jobs = [
      { id: 1, meta: { unrelated: "preserved" } },
      { id: 2, meta: { mediaRecoveryCount: "2" } },
      { id: 3, meta: { mediaRecoveryCount: "3" } },
      { id: 4, meta: { mediaRecoveryCount: "invalid" } },
    ];
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: jobs })
      .mockResolvedValue({ docs: [] });
    const update = vi.fn().mockResolvedValue({ docs: [{}], errors: [] });
    const payload = { find, update } as unknown as Payload;
    expect(await createMediaJobsRuntime(payload).recover(vi.fn())).toEqual({
      recovered: 2,
      failed: 2,
    });
    const where = find.mock.calls[0][0].where;
    expect(where.and).toEqual(
      expect.arrayContaining([
        { queue: { equals: "media" } },
        { taskSlug: { equals: "processMedia" } },
        { processing: { equals: true } },
        { completedAt: { exists: false } },
        { hasError: { not_equals: true } },
      ]),
    );
    expect(find.mock.calls[0][0].limit).toBe(100);
    expect(update.mock.calls[0][0].data).toEqual({
      processing: false,
      meta: { unrelated: "preserved", mediaRecoveryCount: "1" },
    });
    expect(update.mock.calls[1][0].data.meta.mediaRecoveryCount).toBe("3");
    expect(update.mock.calls[2][0].data).toMatchObject({
      processing: false,
      hasError: true,
      error: { name: "MediaRecoveryLimitError" },
    });
    for (const [args] of update.mock.calls) {
      expect(args.where.and[0]).toEqual(where);
      expect(args.data).not.toHaveProperty("input");
      expect(args.data).not.toHaveProperty("log");
      expect(args.data).not.toHaveProperty("totalTried");
    }
  });

  it("stops recovery without touching subsequent jobs if ownership or a native write fails", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }] });
    const update = vi
      .fn()
      .mockResolvedValue({ docs: [], errors: [{ message: "write failed" }] });
    const runtime = createMediaJobsRuntime({
      find,
      update,
    } as unknown as Payload);
    await expect(runtime.recover(vi.fn())).rejects.toThrow(
      "Не удалось восстановить",
    );
    expect(update).toHaveBeenCalledOnce();
    update.mockClear();
    const assertHeld = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("lock lost"));
    await expect(runtime.recover(assertHeld)).rejects.toThrow("lock lost");
    expect(update).not.toHaveBeenCalled();
  });

  it("uses regular native pending-job selection with one sequential task, never runByID", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const runByID = vi.fn();
    const destroy = vi.fn();
    const runtime = createMediaJobsRuntime({
      jobs: { run, runByID },
      destroy,
    } as unknown as Payload);
    await runtime.run();
    expect(run).toHaveBeenCalledWith({
      queue: "media",
      limit: 1,
      sequential: true,
      overrideAccess: true,
      where: { taskSlug: { equals: "processMedia" } },
    });
    expect(runByID).not.toHaveBeenCalled();
    await runtime.close();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
