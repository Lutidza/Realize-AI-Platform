/**
 * @file packages/payload-ai-plugin/src/search-observability/mapSearchObservationAnalytics.mapper.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Формирует allowlist DTO графика и сравнения без подмены отсутствующих измерений нулями.
 * @see documentation/architecture/repository-search.md
 */
import type {
  SearchObservationAggregate,
  SearchObservationAnalytics,
} from "@realize/ai-contracts";
import type {
  SearchObservationAggregateRow,
  SearchObservationAnalyticsWindow,
} from "./SearchObservationAnalytics.types";

function metrics(
  row?: SearchObservationAggregateRow,
): SearchObservationAggregate {
  return {
    count: row?.count ?? 0,
    complete: row?.complete ?? 0,
    errors: row?.errors ?? 0,
    partial: row?.partial ?? 0,
    cancelled: row?.cancelled ?? 0,
    empty: row?.empty ?? 0,
    averageMs: row?.averageMs ?? null,
    p95Ms: row?.p95Ms ?? null,
    completePercent: row?.count ? (row.complete / row.count) * 100 : null,
    averageBytesRead: row?.averageBytesRead ?? null,
    measuredReads: row?.measuredReads ?? 0,
    averageOutputBytes: row?.averageOutputBytes ?? null,
  };
}

/** Нулевая или неизмеренная база не позволяет вычислить относительное изменение. */
function reduction(before: number | null, after: number | null) {
  return before !== null && before > 0 && after !== null
    ? ((before - after) / before) * 100
    : null;
}

export function mapSearchObservationAnalytics(
  rows: SearchObservationAggregateRow[],
  window: SearchObservationAnalyticsWindow,
): SearchObservationAnalytics {
  const grouped = new Map(rows.map((row) => [row.key, metrics(row)]));
  const get = (key: string) => grouped.get(key) ?? metrics();
  const iso = (time: number) => new Date(time).toISOString();
  const before = get("before");
  const after = get("after");
  const unavailableReason =
    window.availableFrom > window.beforeFrom
      ? "history_limited"
      : !before.count || !after.count
        ? "missing_samples"
        : null;
  const comparable = unavailableReason === null;
  return {
    from: iso(window.from),
    to: iso(window.to),
    availableFrom: iso(window.availableFrom),
    splitAt: iso(window.splitAt),
    bucketMs: window.bucketMs,
    summary: get("total"),
    series: Array.from({ length: window.buckets }, (_, index) => ({
      from: iso(window.from + index * window.bucketMs),
      to: iso(window.from + (index + 1) * window.bucketMs),
      metrics: get("bucket:" + index),
    })),
    comparison: {
      before: {
        from: iso(window.beforeFrom),
        to: iso(window.splitAt),
        metrics: before,
      },
      after: {
        from: iso(window.splitAt),
        to: iso(window.afterTo),
        metrics: after,
      },
      unavailableReason,
      speedImprovementPercent: comparable
        ? reduction(before.averageMs, after.averageMs)
        : null,
      completeChangePoints:
        comparable &&
        before.completePercent !== null &&
        after.completePercent !== null
          ? after.completePercent - before.completePercent
          : null,
      readReductionPercent: comparable
        ? reduction(before.averageBytesRead, after.averageBytesRead)
        : null,
    },
  };
}
