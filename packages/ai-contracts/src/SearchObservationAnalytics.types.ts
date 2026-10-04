/**
 * @file packages/ai-contracts/src/SearchObservationAnalytics.types.ts
 * @version 1.1.0
 * @date 2026-09-30
 * @description Описывает временные агрегаты и сравнение сохранённых замеров поиска.
 * @see documentation/architecture/repository-search.md
 */
import type {
  SearchAggregateHistory,
  SearchQualityHistory,
} from "./SearchQuality.types";

/** Проценты отражают полноту выполнения, а не релевантность найденного кода. */
export type SearchObservationAggregate = {
  count: number;
  complete: number;
  errors: number;
  partial: number;
  cancelled: number;
  empty: number;
  averageMs: number | null;
  p95Ms: number | null;
  completePercent: number | null;
  averageBytesRead: number | null;
  measuredReads: number;
  averageOutputBytes: number | null;
};

export type SearchObservationInterval = {
  from: string;
  to: string;
  metrics: SearchObservationAggregate;
};

/** Равные окна разделены splitAt; отсутствие измерений не заменяется нулём. */
export type SearchObservationAnalytics = {
  history?: SearchAggregateHistory;
  quality?: SearchQualityHistory;
  from: string;
  to: string;
  availableFrom: string;
  splitAt: string;
  bucketMs: number;
  summary: SearchObservationAggregate;
  series: SearchObservationInterval[];
  comparison: {
    before: SearchObservationInterval;
    after: SearchObservationInterval;
    unavailableReason: "missing_samples" | "history_limited" | null;
    /** Положительное значение означает уменьшение среднего времени. */
    speedImprovementPercent: number | null;
    completeChangePoints: number | null;
    readReductionPercent: number | null;
  };
};
