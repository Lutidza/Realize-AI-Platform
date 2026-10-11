/**
 * @file packages/payload-ai-plugin/src/usage/readUsageAnalytics.repository.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Сравнивает равные интервалы и причины расходов в том же PostgreSQL snapshot без raw документов.
 * @see documentation/specifications/realize-ai-commerce/v1.0/04-commercial-and-operations/28-observability.md
 */
import type {
  UsageAnalyticsDto,
  UsagePeriodMetricsDto,
} from "@realize/ai-contracts";
import type { UsageAnalyticsReadOptions } from "./UsageAnalytics.types";

/** where поступает только из UsageDashboardRepository, пользовательские значения — bind parameters. */
export async function readUsageAnalytics({
  client,
  where,
  values,
  from,
  to,
  readAmounts,
}: UsageAnalyticsReadOptions): Promise<UsageAnalyticsDto> {
  const readMetrics = async (period: unknown[]) => {
    const result = await client.query<
      UsagePeriodMetricsDto & { attempts: number }
    >(
      `SELECT count(*)::int AS attempts,
      count(*) FILTER(WHERE record->>'provider'<>'platform')::int AS "modelAttempts",
      count(*) FILTER(WHERE record->>'provider'<>'platform' AND record->>'outcome'='completed')::int AS completed,
      count(*) FILTER(WHERE record->>'provider'<>'platform' AND record->>'outcome'='failed')::int AS failed,
      count(*) FILTER(WHERE record->>'provider'<>'platform' AND record->>'outcome'='cancelled')::int AS cancelled,
      count(*) FILTER(WHERE record->>'provider'<>'platform' AND record->>'outcome'='running')::int AS running,
      count(*) FILTER(WHERE record->>'provider'<>'platform' AND (record->'context'->>'attemptNumber')::int>1)::int AS retries,
      sum((record->'tokens'->>'inputTokens')::numeric) FILTER(WHERE record->>'provider'<>'platform')::text AS "inputTokens",
      sum((record->'tokens'->>'outputTokens')::numeric) FILTER(WHERE record->>'provider'<>'platform')::text AS "outputTokens",
      count(*) FILTER(WHERE record->>'provider'<>'platform' AND (record->'tokens'->>'inputTokens' IS NULL OR record->'tokens'->>'outputTokens' IS NULL))::int AS "unknownTokenAttempts",
      sum((record->'tokens'->>'inputTokens')::numeric) FILTER(WHERE record->>'provider'<>'platform' AND record->'tokens'->>'cachedInputTokens' IS NOT NULL)::text AS "cacheInputTokens",
      sum((record->'tokens'->>'cachedInputTokens')::numeric) FILTER(WHERE record->>'provider'<>'platform' AND record->'tokens'->>'inputTokens' IS NOT NULL)::text AS "cachedInputTokens",
      count(*) FILTER(WHERE record->>'provider'<>'platform' AND record->'tokens'->>'inputTokens' IS NOT NULL AND record->'tokens'->>'cachedInputTokens' IS NOT NULL)::int AS "cacheMeasuredAttempts",
      count(*) FILTER(WHERE record->>'provider'<>'platform' AND record->>'outcome'<>'running' AND record->>'durationMs' IS NOT NULL)::int AS "timedAttempts",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY (record->>'durationMs')::double precision) FILTER(WHERE record->>'provider'<>'platform' AND record->>'outcome'<>'running') AS "p50DurationMs",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY (record->>'durationMs')::double precision) FILTER(WHERE record->>'provider'<>'platform' AND record->>'outcome'<>'running') AS "p95DurationMs"
      FROM realize_ai_usage_attempts WHERE ${where}`,
      period,
    );
    return result.rows[0];
  };
  const previousFrom = new Date(
    Date.parse(from) - (Date.parse(to) - Date.parse(from)),
  ).toISOString();
  const previousValues = [previousFrom, from, ...values.slice(2)];
  const { attempts: _attempts, ...current } = await readMetrics(values);
  const previous = await readMetrics(previousValues);
  return {
    current,
    previous: {
      ...previous,
      from: previousFrom,
      to: from,
      amounts: await readAmounts(previousValues, "all"),
    },
    retryAmounts: await readAmounts(values, "retry"),
    unsuccessfulAmounts: await readAmounts(values, "unsuccessful"),
  };
}
