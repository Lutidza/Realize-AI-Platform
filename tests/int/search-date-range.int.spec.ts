/**
 * @file tests/int/search-date-range.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-03
 * @description Проверяет общий период API, сохранение календарного дня и polling исторического диапазона.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchObservationQuerySchema } from "@realize/ai-contracts";
import { resolveSearchObservationWindow } from "../../packages/payload-ai-plugin/src/search-observability/resolveSearchObservationWindow.service";
import { useSearchObservations } from "../../packages/payload-ai-plugin/src/admin/search-observability/useSearchObservations.hook";
import { useSearchObservationPeriod } from "../../packages/payload-ai-plugin/src/admin/search-observability/useSearchObservationPeriod.hook";
import {
  formatUiCalendarDate,
  parseUiCalendarDate,
} from "../../packages/ui-kit/src/date-picker/uiCalendarDate.util";
import {
  workflowRunsFilterQuery,
  workflowRunsFilterValues,
} from "../../packages/payload-ai-plugin/src/admin/workflow-runs/workflowRunsFilters.util";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: request,
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  request.mockReset();
});
const now = Date.parse("2026-11-03T12:00:00Z");
const from = "2026-11-02T01:00:00.000Z";
const to = "2026-11-02T03:00:00.000Z";

describe("search period", () => {
  it("keeps legacy default and rejects ambiguous, incomplete, reversed and unbounded ranges", () => {
    expect(searchObservationQuerySchema.parse({})).toEqual({ hours: "24" });
    expect(searchObservationQuerySchema.parse({ from, to })).toEqual({
      from,
      to,
    });
    for (const query of [
      { from },
      { to },
      { from, to, hours: "24" },
      { from: to, to: from },
      { from, to: from },
      { from, to: "2026-11-10T00:00:00Z" },
    ])
      expect(searchObservationQuerySchema.safeParse(query).success).toBe(false);
  });
  it("resolves fixed windows and cleanup once with symmetric comparison and exclusive end", () => {
    const split = Date.parse(from) + 30 * 60000;
    const cutoff = Date.parse(from) + 10 * 60000;
    expect(
      resolveSearchObservationWindow(
        { from, to, compareAt: new Date(split).toISOString() },
        now,
        cutoff,
      ),
    ).toMatchObject({
      from: Date.parse(from),
      to: Date.parse(to),
      availableFrom: cutoff,
      splitAt: split,
      beforeFrom: Date.parse(from),
      afterTo: split + 30 * 60000,
      bucketMs: 300000,
    });
    for (const query of [
      { from, to: new Date(now + 1).toISOString() },
      { from, to, compareAt: to },
    ])
      expect(() => resolveSearchObservationWindow(query, now, 0)).toThrow();
  });
  it("preserves calendar days across DST and year boundaries for the UTC consumer", () => {
    for (const day of ["2026-03-29", "2026-11-01", "2026-12-31"]) {
      expect(formatUiCalendarDate(parseUiCalendarDate(day))).toBe(day);
      const query = workflowRunsFilterQuery({
        ...workflowRunsFilterValues({ page: 1, pageSize: 25 }),
        createdFrom: day,
        createdThrough: day,
      });
      expect(
        Date.parse(query.createdTo!) - Date.parse(query.createdFrom!),
      ).toBe(86400000);
      expect(workflowRunsFilterValues(query).createdThrough).toBe(day);
    }
    expect(parseUiCalendarDate("2026-02-30")).toBeNull();
  });
  it("keeps draft edits local, validates the chosen moment and applies/reset atomically", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const onApply = vi.fn();
    const { result } = renderHook(() =>
      useSearchObservationPeriod({ onApply }),
    );
    act(() => result.current.setPreset("custom"));
    act(() => result.current.setRange([new Date(from), new Date(to)]));
    expect(onApply).not.toHaveBeenCalled();
    act(() => result.current.setComparison("moment"));
    act(() => result.current.setMoment(new Date(to)));
    act(() => result.current.apply());
    expect(onApply).not.toHaveBeenCalled();
    expect(result.current.error).toContain("внутри");
    act(() => result.current.setMoment(new Date(Date.parse(from) + 3600000)));
    act(() => result.current.apply());
    expect(onApply).toHaveBeenCalledWith({
      from,
      to,
      hours: "",
      compareAt: "2026-11-02T02:00:00.000Z",
    });
    act(() => result.current.reset());
    expect(onApply).toHaveBeenLastCalledWith({
      from: "",
      to: "",
      hours: "24",
      compareAt: "",
    });
  });
  it("cancels stale requests, resets pagination and stops polling a fixed range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    request.mockResolvedValue({ next: "25", items: [] });
    const { result } = renderHook(() => useSearchObservations("/api"));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(request).toHaveBeenCalledTimes(2);
    act(() => result.current.next());
    await act(async () => {});
    expect(result.current.hasPrevious).toBe(true);
    const previousSignal = request.mock.calls.at(-1)![1].signal as AbortSignal;
    act(() =>
      result.current.applyPeriod({ from, to, hours: "", compareAt: "" }),
    );
    await act(async () => {});
    expect(previousSignal.aborted).toBe(true);
    expect(result.current.hasPrevious).toBe(false);
    expect(request.mock.calls.at(-1)![0]).toContain("from=");
    const count = request.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(request).toHaveBeenCalledTimes(count);
    act(() => result.current.refresh());
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(count + 1);
  });
  it("resumes an unfinished historical request after a rapid hide/show", async () => {
    vi.useFakeTimers();
    let hidden = false;
    const visibility = vi
      .spyOn(document, "hidden", "get")
      .mockImplementation(() => hidden);
    request.mockResolvedValueOnce({ next: null, items: [] });
    request.mockImplementationOnce(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    request.mockResolvedValue({ next: null, items: [] });
    const { result } = renderHook(() => useSearchObservations("/api"));
    await act(async () => {});
    act(() =>
      result.current.applyPeriod({ from, to, hours: "", compareAt: "" }),
    );
    act(() => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(result.current.loading).toBe(false);
    expect(request).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(request).toHaveBeenCalledTimes(3);
    visibility.mockRestore();
  });
});
