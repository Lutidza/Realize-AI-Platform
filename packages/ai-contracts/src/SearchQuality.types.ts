/**
 * @file packages/ai-contracts/src/SearchQuality.types.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Задаёт независимые контрольные цели, сравнимые версии и обезличенную длительную историю.
 */
import type { z } from "zod";
import type { searchQualityRunSchema } from "./searchQuality.schemas";
import type { SearchObservationInterval } from "./SearchObservationAnalytics.types";
export type SearchQualityRun = z.infer<typeof searchQualityRunSchema>;
export type SearchQualityComparison = {
  before: SearchQualityRun;
  after: SearchQualityRun;
  accuracyChangePoints: number;
  taskTimeReductionPercent: number | null;
  callReductionPercent: number | null;
  readReductionPercent: number | null;
};
export type SearchQualityHistory = {
  runs: SearchQualityRun[];
  comparisons: SearchQualityComparison[];
  retentionDays: number;
};
/** Дневные суммы сохраняют средние и counts; точный p95 после raw retention не восстанавливается. */
export type SearchAggregateHistory = {
  retentionDays: number;
  availableFrom: string | null;
  series: SearchObservationInterval[];
};
