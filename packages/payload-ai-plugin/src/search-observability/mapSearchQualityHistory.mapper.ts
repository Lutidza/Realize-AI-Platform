/**
 * @file packages/payload-ai-plugin/src/search-observability/mapSearchQualityHistory.mapper.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Сравнивает только одинаковые контрольные корпуса, consumers и фазы кеша.
 */
import type {
  SearchQualityRun,
  SearchQualityHistory,
  SearchQualityComparison,
} from "@realize/ai-contracts";
const reduction = (before: number | null, after: number | null) =>
  before !== null && before > 0 && after !== null
    ? (100 * (before - after)) / before
    : null;
export function mapSearchQualityHistory(
  runs: SearchQualityRun[],
): SearchQualityHistory {
  const sorted = [...runs].sort((a, b) =>
    b.observedAt.localeCompare(a.observedAt),
  );
  const comparisons: SearchQualityComparison[] = [];
  for (const after of sorted) {
    const before = sorted.find(
      (run) =>
        run.observedAt < after.observedAt &&
        run.corpus === after.corpus &&
        run.corpusVersion === after.corpusVersion &&
        run.consumer === after.consumer &&
        run.cache === after.cache &&
        run.repeat === after.repeat &&
        run.targets === after.targets &&
        (run.sourceVersion !== after.sourceVersion ||
          run.mode !== after.mode ||
          run.release !== after.release),
    );
    if (before)
      comparisons.push({
        before,
        after,
        accuracyChangePoints:
          100 *
          (after.correctTargets / after.targets -
            before.correctTargets / before.targets),
        taskTimeReductionPercent: reduction(
          before.taskDurationMs,
          after.taskDurationMs,
        ),
        callReductionPercent: reduction(before.calls, after.calls),
        readReductionPercent: reduction(before.bytesRead, after.bytesRead),
      });
    if (comparisons.length >= 16) break;
  }
  return { runs: sorted, comparisons, retentionDays: 180 };
}
