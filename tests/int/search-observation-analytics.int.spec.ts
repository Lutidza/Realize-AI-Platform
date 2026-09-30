/**
 * @file tests/int/search-observation-analytics.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Проверяет отсутствие выдуманных данных, безопасное сравнение периодов и разрывы графика.
 */
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { searchObservationQuerySchema } from "@realize/ai-contracts";
import { mapSearchObservationAnalytics } from "../../packages/payload-ai-plugin/src/search-observability/mapSearchObservationAnalytics.mapper";
import { readSearchObservationAnalytics } from "../../packages/payload-ai-plugin/src/search-observability/readSearchObservationAnalytics.repository";
import type { SearchObservationAggregateRow } from "../../packages/payload-ai-plugin/src/search-observability/SearchObservationAnalytics.types";
import {
  buildSearchObservationTrend,
  formatSearchMetric,
} from "../../packages/payload-ai-plugin/src/admin/search-observability/searchObservationAnalyticsPresentation.util";

const from = Date.parse("2026-09-29T00:00:00.000Z");
const hour = 3600000;
const window = {
  from,
  to: from + 24 * hour,
  splitAt: from + 12 * hour,
  beforeFrom: from,
  afterTo: from + 24 * hour,
  availableFrom: from,
  buckets: 24,
  bucketMs: hour,
};
const row = (
  key: string,
  extra: Partial<SearchObservationAggregateRow> = {},
): SearchObservationAggregateRow => ({
  key,
  count: 4,
  complete: 3,
  errors: 1,
  partial: 0,
  cancelled: 0,
  empty: 1,
  averageMs: 100,
  p95Ms: 150,
  averageBytesRead: null,
  measuredReads: 0,
  averageOutputBytes: 10,
  ...extra,
});

describe("search analytics public meaning", () => {
  it("keeps missing intervals, unknown reads and empty rates null", () => {
    const data = mapSearchObservationAnalytics([], window);
    expect(data.series).toHaveLength(24);
    expect(
      data.series.every(
        (item) => item.metrics.count === 0 && item.metrics.averageMs === null,
      ),
    ).toBe(true);
    expect(data.summary).toMatchObject({
      count: 0,
      averageMs: null,
      completePercent: null,
      averageBytesRead: null,
      measuredReads: 0,
    });
    expect(data.comparison).toMatchObject({
      unavailableReason: "missing_samples",
      speedImprovementPercent: null,
      completeChangePoints: null,
    });
    expect(formatSearchMetric(null, "ms")).toBe("Нет измерений");
  });
  it("uses full-execution percentage points separately from latency reduction", () => {
    const data = mapSearchObservationAnalytics(
      [
        row("before", {
          averageMs: 200,
          complete: 2,
          partial: 1,
          averageBytesRead: 400,
        }),
        row("after", { averageMs: 50, averageBytesRead: 100 }),
      ],
      window,
    );
    expect(data.comparison).toMatchObject({
      unavailableReason: null,
      speedImprovementPercent: 75,
      completeChangePoints: 25,
      readReductionPercent: 75,
    });
  });
  it("preserves measured zero without division by a zero baseline", () => {
    const data = mapSearchObservationAnalytics(
      [
        row("before", { averageMs: 0, averageBytesRead: 0, measuredReads: 4 }),
        row("after", { averageMs: 5, averageBytesRead: 5, measuredReads: 4 }),
      ],
      window,
    );
    expect(data.comparison.before.metrics.averageMs).toBe(0);
    expect(data.comparison.speedImprovementPercent).toBeNull();
    expect(data.comparison.readReductionPercent).toBeNull();
    expect(formatSearchMetric(0, "ms")).toBe("0 мс");
  });
  it("does not claim progress when cleanup or retention cuts the before window", () => {
    const data = mapSearchObservationAnalytics([row("before"), row("after")], {
      ...window,
      availableFrom: from + hour,
    });
    expect(data.comparison).toMatchObject({
      unavailableReason: "history_limited",
      speedImprovementPercent: null,
      completeChangePoints: null,
      readReductionPercent: null,
    });
  });
  it("shows a regression with its sign and never maps an empty result to an error", () => {
    const data = mapSearchObservationAnalytics(
      [
        row("before", { averageMs: 50, complete: 4, errors: 0, empty: 4 }),
        row("after", { averageMs: 100, complete: 2, errors: 2 }),
      ],
      window,
    );
    expect(data.comparison.before.metrics.completePercent).toBe(100);
    expect(data.comparison.speedImprovementPercent).toBe(-100);
    expect(data.comparison.completeChangePoints).toBe(-50);
  });
  it("does not connect graph lines across gaps or invent unread byte measurements", () => {
    const data = mapSearchObservationAnalytics(
      [
        row("bucket:0", { averageMs: 0 }),
        row("bucket:1", { averageMs: 100 }),
        row("bucket:3", { averageMs: 50 }),
      ],
      window,
    );
    const chart = buildSearchObservationTrend(data, "averageMs");
    expect(chart.line.match(/M/g)).toHaveLength(2);
    expect(chart.line.match(/L/g)).toHaveLength(1);
    expect(chart.points[0].y).toBe(196);
    expect(chart.points[2].y).toBeNull();
    expect(
      buildSearchObservationTrend(data, "averageBytesRead").line.trim(),
    ).toBe("");
  });
  it("accepts only bounded operations and ISO comparison dates", () => {
    expect(
      searchObservationQuerySchema.parse({
        operation: "imports",
        compareAt: new Date(window.splitAt).toISOString(),
      }),
    ).toMatchObject({ hours: "24", operation: "imports" });
    for (const query of [
      { operation: "exec" },
      { compareAt: "yesterday" },
      { hours: "999" },
      { query: "private" },
    ])
      expect(searchObservationQuerySchema.safeParse(query).success).toBe(false);
  });
  it("rejects comparison boundaries before querying SQL", async () => {
    const query = vi.fn();
    for (const time of [from, window.to, window.to + 1]) {
      await expect(
        readSearchObservationAnalytics(
          { query } as unknown as PoolClient,
          { hours: "24", compareAt: new Date(time).toISOString() },
          window.to,
          from,
        ),
      ).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    }
    expect(query).not.toHaveBeenCalled();
  });
});
