/**
 * @file packages/payload-ai-plugin/src/search-observability/retainSearchAggregateHistory.service.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Сохраняет 180 дней дневных sums/counts независимо от raw retention и повторной доставки.
 * @see documentation/architecture/repository-search.md
 */
import type { PoolClient } from "pg";
import type {
  SearchObservation,
  SearchAggregateHistory,
} from "@realize/ai-contracts";
import type { SearchObservationControlState } from "./SearchObservationControl.types";
import { searchAggregateDaySchema } from "./searchAggregateHistory.schemas";
import type { z } from "zod";
type Day = z.infer<typeof searchAggregateDaySchema>;
const daysToKeep = 180;
const empty = (day: string): Day => ({
  day,
  count: 0,
  complete: 0,
  errors: 0,
  partial: 0,
  cancelled: 0,
  empty: 0,
  durationMs: 0,
  bytesRead: 0,
  measuredReads: 0,
  outputBytes: 0,
});

/** Backfill читает агрегаты SQL, никогда весь raw corpus. Вызывается до нового INSERT под общей блокировкой. */
export async function initializeSearchAggregateHistory(
  client: PoolClient,
  state: SearchObservationControlState,
) {
  if (state.aggregateHistory.initialized) return;
  const result = await client.query(
    `SELECT to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day, min(observed_at) AS "availableFrom",
    count(*)::int AS count, count(*) FILTER (WHERE outcome='complete')::int AS complete,
    count(*) FILTER (WHERE outcome='error')::int AS errors, count(*) FILTER (WHERE outcome='partial')::int AS partial,
    count(*) FILTER (WHERE outcome='cancelled')::int AS cancelled,
    count(*) FILTER (WHERE (event->>'returnedCount')::numeric=0)::int AS empty,
    coalesce(sum(duration_ms),0)::float8 AS "durationMs",
    coalesce(sum((event->>'bytesRead')::numeric),0)::float8 AS "bytesRead",
    count(event->>'bytesRead')::int AS "measuredReads", coalesce(sum((event->>'outputBytes')::numeric),0)::float8 AS "outputBytes"
    FROM realize_ai_search_observations WHERE observed_at >= $1 GROUP BY day ORDER BY day`,
    [new Date(Date.now() - daysToKeep * 86400000)],
  );
  state.aggregateHistory = {
    initialized: true,
    availableFrom: result.rows.length
      ? new Date(result.rows[0].availableFrom).toISOString()
      : new Date().toISOString(),
    days: result.rows.map(({ availableFrom: _availableFrom, ...row }) =>
      searchAggregateDaySchema.parse(row),
    ),
  };
}

export function retainSearchAggregateHistory(
  state: SearchObservationControlState,
  events: SearchObservation[],
  now = Date.now(),
) {
  const rows = new Map(
    state.aggregateHistory.days.map((row) => [row.day, row]),
  );
  for (const event of events) {
    if (
      !state.aggregateHistory.availableFrom ||
      event.observedAt < state.aggregateHistory.availableFrom
    )
      state.aggregateHistory.availableFrom = event.observedAt;
    const day = event.observedAt.slice(0, 10);
    const row = rows.get(day) ?? empty(day);
    row.count++;
    row.complete += Number(event.outcome === "complete");
    row.errors += Number(event.outcome === "error");
    row.partial += Number(event.outcome === "partial");
    row.cancelled += Number(event.outcome === "cancelled");
    row.empty += Number(event.returnedCount === 0);
    row.durationMs += event.durationMs;
    row.outputBytes += event.outputBytes;
    if (event.bytesRead !== null) {
      row.measuredReads++;
      row.bytesRead += event.bytesRead;
    }
    rows.set(day, row);
  }
  state.aggregateHistory.days = [...rows.values()]
    .filter((row) => Date.parse(row.day) >= now - daysToKeep * 86400000)
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-181);
  if (state.aggregateHistory.availableFrom)
    state.aggregateHistory.availableFrom = new Date(
      Math.max(
        Date.parse(state.aggregateHistory.availableFrom),
        now - daysToKeep * 86400000,
      ),
    ).toISOString();
}

export function mapSearchAggregateHistory(
  state: SearchObservationControlState,
): SearchAggregateHistory {
  return {
    retentionDays: daysToKeep,
    availableFrom: state.aggregateHistory.availableFrom,
    series: state.aggregateHistory.days.map((row) => ({
      from: `${row.day}T00:00:00.000Z`,
      to: new Date(Date.parse(row.day) + 86400000).toISOString(),
      metrics: {
        count: row.count,
        complete: row.complete,
        errors: row.errors,
        partial: row.partial,
        cancelled: row.cancelled,
        empty: row.empty,
        averageMs: row.count ? row.durationMs / row.count : null,
        p95Ms: null,
        completePercent: row.count ? (100 * row.complete) / row.count : null,
        averageBytesRead: row.measuredReads
          ? row.bytesRead / row.measuredReads
          : null,
        measuredReads: row.measuredReads,
        averageOutputBytes: row.count ? row.outputBytes / row.count : null,
      },
    })),
  };
}
