/**
 * @file packages/payload-ai-plugin/src/search-observability/SearchObservationAnalytics.types.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Задаёт внутренние строки агрегирования и границы временных окон.
 */
import type { SearchObservationAggregate } from "@realize/ai-contracts";

export type SearchObservationAggregateRow = Omit<
  SearchObservationAggregate,
  "completePercent"
> & { key: string };

export type SearchObservationAnalyticsWindow = {
  from: number;
  to: number;
  availableFrom: number;
  splitAt: number;
  beforeFrom: number;
  afterTo: number;
  bucketMs: number;
  buckets: number;
};
