/**
 * @file tests/int/search-observation-runtime.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Проверяет обслуживание без поисков, heartbeat и восстановление очереди MCP.
 */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchObservationRuntimeMonitor } from "../../packages/payload-ai-plugin/src/search-observability/SearchObservationRuntimeMonitor.service";
import { SearchObservationCollector } from "../../packages/payload-ai-plugin/src/search-observability/SearchObservationCollector.service";
import { EndpointError } from "../../packages/payload-ai-plugin/src/endpoints/http";
import { searchObservationFixture } from "./searchObservation.fixture";

describe("search observation runtime lifecycle", () => {
  const running: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    await Promise.all(running.splice(0).map((runtime) => runtime.close()));
    vi.useRealTimers();
  });

  it("starts maintenance immediately, shares work and continues when searches are idle", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const maintain = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue({ revision: 1, cleaned: false });
    const monitor = new SearchObservationRuntimeMonitor({
      store: { maintain },
      source: "cli",
      warn: vi.fn(),
      snapshot: () => ({
        queued: 0,
        dropped: 0,
        lastDeliveredAt: null,
        lastFailureAt: null,
        errorCode: null,
      }),
    });
    running.push(monitor);
    const first = monitor.tick();
    expect(monitor.tick()).toBe(first);
    await vi.advanceTimersByTimeAsync(20000);
    expect(maintain).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await vi.advanceTimersByTimeAsync(10000);
    expect(maintain).toHaveBeenCalledTimes(2);
    expect(maintain.mock.calls[1][0]).toMatchObject({
      source: "cli",
      queued: 0,
    });
    await monitor.close();
    await vi.advanceTimersByTimeAsync(60000);
    expect(maintain).toHaveBeenCalledTimes(2);
  });

  it("bounds maintenance warnings and recovers automatically", async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const maintain = vi
      .fn()
      .mockRejectedValue(new Error("private database error"));
    const monitor = new SearchObservationRuntimeMonitor({
      store: { maintain },
      source: "mcp",
      warn,
      snapshot: () => ({
        queued: 0,
        dropped: 0,
        lastDeliveredAt: null,
        lastFailureAt: null,
        errorCode: null,
      }),
    });
    running.push(monitor);
    await monitor.tick();
    await vi.advanceTimersByTimeAsync(50000);
    expect(warn).toHaveBeenCalledTimes(1);
    maintain.mockResolvedValue({ revision: 2, cleaned: true });
    await vi.advanceTimersByTimeAsync(10000);
    expect(maintain).toHaveBeenCalledTimes(7);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("retains failed batches within capacity, retries and reports recovery", async () => {
    vi.useFakeTimers();
    const append = vi
      .fn()
      .mockRejectedValueOnce(new Error("private DB detail"))
      .mockResolvedValue(100);
    const maintain = vi.fn().mockResolvedValue({ revision: 1, cleaned: false });
    const collector = new SearchObservationCollector(
      { append, control: { maintain } },
      vi.fn(),
    );
    running.push(collector);
    const first = searchObservationFixture({ source: "mcp" });
    collector.record(first);
    await collector.flush();
    for (let i = 0; i < 100; i++)
      collector.record(searchObservationFixture({ source: "mcp" }));
    expect(collector.snapshot()).toMatchObject({
      queued: 100,
      dropped: 1,
      errorCode: "delivery_unavailable",
    });
    await collector.flush();
    expect(append).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(append.mock.calls[1][0]).toHaveLength(100);
    expect(append.mock.calls[1][0][0]).toEqual(first);
    expect(collector.snapshot()).toMatchObject({
      queued: 0,
      dropped: 1,
      errorCode: null,
    });
    expect(collector.snapshot().lastDeliveredAt).not.toBeNull();
    expect(collector.snapshot().lastFailureAt).not.toBeNull();
    await vi.advanceTimersByTimeAsync(8000);
    expect(maintain.mock.lastCall?.[0]).toMatchObject({
      queued: 0,
      dropped: 1,
      errorCode: null,
    });
  });

  it("does not loop on deterministic invalid batches and accounts for shutdown loss", async () => {
    vi.useFakeTimers();
    const append = vi
      .fn()
      .mockRejectedValueOnce(new EndpointError("CONFLICT", "conflict", 409))
      .mockRejectedValue(new Error("offline"));
    const maintain = vi.fn().mockResolvedValue({ revision: 1, cleaned: false });
    const collector = new SearchObservationCollector(
      { append, control: { maintain } },
      vi.fn(),
    );
    running.push(collector);
    collector.record(searchObservationFixture({ source: "mcp" }));
    await collector.flush();
    expect(collector.snapshot()).toMatchObject({ queued: 0, dropped: 1 });
    collector.record(searchObservationFixture({ source: "mcp" }));
    await collector.close();
    expect(collector.snapshot()).toMatchObject({ queued: 0, dropped: 2 });
    expect(maintain.mock.lastCall?.[0]).toMatchObject({
      queued: 0,
      dropped: 2,
    });
  });
});
