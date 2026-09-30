/**
 * @file packages/payload-ai-plugin/src/search-observability/readSearchObservationAnalytics.repository.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Агрегирует bounded историю PostgreSQL по времени, источнику и операции в том же снимке чтения.
 * @see documentation/architecture/repository-search.md
 */
import type { PoolClient } from "pg";
import type { SearchObservationQuery } from "@realize/ai-contracts";
import { EndpointError } from "../endpoints/http";
import { mapSearchObservationAnalytics } from "./mapSearchObservationAnalytics.mapper";
import type { SearchObservationAggregateRow } from "./SearchObservationAnalytics.types";

/** Фильтры outcome/slow и cursor намеренно не меняют знаменатель эффективности. */
export async function readSearchObservationAnalytics(
  client: PoolClient,
  query: SearchObservationQuery,
  now: number,
  availableFrom: number,
) {
  const from = now - Number(query.hours) * 3600000;
  const splitAt = query.compareAt
    ? Date.parse(query.compareAt)
    : (from + now) / 2;
  if (!Number.isFinite(splitAt) || splitAt <= from || splitAt >= now)
    throw new EndpointError(
      "INVALID_REQUEST",
      "Дата сравнения должна находиться внутри выбранного периода.",
      400,
    );
  const half = Math.min(splitAt - from, now - splitAt);
  const window = {
    from,
    to: now,
    availableFrom,
    splitAt,
    beforeFrom: splitAt - half,
    afterTo: splitAt + half,
    buckets: 24,
    bucketMs: (now - from) / 24,
  };
  const result = await client.query<SearchObservationAggregateRow>(
    `WITH selected AS (
      SELECT observed_at, outcome, duration_ms,
        (event->>'bytesRead')::numeric AS bytes_read,
        (event->>'outputBytes')::numeric AS output_bytes,
        (event->>'returnedCount')::numeric AS returned_count
      FROM realize_ai_search_observations
      WHERE observed_at >= $4::timestamptz AND observed_at < $2::timestamptz
        AND ($8::text IS NULL OR source = $8)
        AND ($9::text IS NULL OR event->>'operation' = $9)
    )
    SELECT groups.key,
      count(*)::int AS count,
      count(*) FILTER (WHERE outcome='complete')::int AS complete,
      count(*) FILTER (WHERE outcome='error')::int AS errors,
      count(*) FILTER (WHERE outcome='partial')::int AS partial,
      count(*) FILTER (WHERE outcome='cancelled')::int AS cancelled,
      count(*) FILTER (WHERE returned_count=0)::int AS empty,
      avg(duration_ms)::float8 AS "averageMs",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::float8 AS "p95Ms",
      avg(bytes_read)::float8 AS "averageBytesRead",
      count(bytes_read)::int AS "measuredReads",
      avg(output_bytes)::float8 AS "averageOutputBytes"
    FROM selected
    CROSS JOIN LATERAL (VALUES
      ('total'),
      ('bucket:' || floor(extract(epoch FROM observed_at - $1::timestamptz) * 1000 / $3::numeric)::int),
      (CASE WHEN observed_at >= $5::timestamptz AND observed_at < $6::timestamptz THEN 'before' END),
      (CASE WHEN observed_at >= $6::timestamptz AND observed_at < $7::timestamptz THEN 'after' END)
    ) AS groups(key)
    WHERE groups.key IS NOT NULL GROUP BY groups.key`,
    [
      new Date(from),
      new Date(now),
      window.bucketMs,
      new Date(availableFrom),
      new Date(window.beforeFrom),
      new Date(splitAt),
      new Date(window.afterTo),
      query.source ?? null,
      query.operation ?? null,
    ],
  );
  return mapSearchObservationAnalytics(result.rows, window);
}
