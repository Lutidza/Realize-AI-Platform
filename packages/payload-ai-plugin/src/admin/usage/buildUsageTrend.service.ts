/**
 * @file packages/payload-ai-plugin/src/admin/usage/buildUsageTrend.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Строит график UTC-интервалов; неизвестные расходы разрывают линию, nanos остаются точными.
 */
import type { UsagePageData } from "./UsageView.types";
import type {
  UsageCostSelection,
  UsageTrend,
  UsageTrendMetric,
  UsageTrendPoint,
} from "./UsageAnalytics.types";
import { summarizeUsageCost } from "./deriveUsageAnalytics.service";
import { observedUsageTokens } from "./usageAnalyticsPresentation.util";

export function buildUsageTrend(
  data: UsagePageData,
  metric: UsageTrendMetric,
  selection: UsageCostSelection,
  measuredWidth = 880,
): UsageTrend {
  const width = Math.max(280, measuredWidth),
    height = 260,
    left = 60,
    right = width - 16,
    top = 24,
    bottom = 220;
  const first = Date.parse(`${data.from.slice(0, 10)}T00:00:00Z`);
  const last = Date.parse(`${data.generatedAt.slice(0, 10)}T00:00:00Z`);
  const days = Math.max(
    1,
    Math.min(367, Math.round((last - first) / 86400000) + 1),
  );
  const groups = new Map(data.byDay.map((group) => [group.key, group]));
  const points: UsageTrendPoint[] = Array.from({ length: days }, (_, index) => {
    const date = new Date(first + index * 86400000);
    const day = date.toISOString().slice(0, 10),
      group = groups.get(day);
    const cost = group
      ? summarizeUsageCost(
          group.amounts,
          group.attempts,
          group.modelAttempts,
          selection,
        )
      : null;
    const value = !group
      ? "0"
      : metric === "attempts"
        ? String(group.modelAttempts)
        : metric === "cost"
          ? cost!.amountNanos
          : group.modelAttempts === 0
            ? "0"
            : observedUsageTokens(group.inputTokens, group.outputTokens);
    return {
      day,
      label: date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      value,
      partial:
        metric === "cost"
          ? (cost?.unknown ?? 0) > 0
          : metric === "tokens"
            ? (group?.unknownTokenAttempts ?? 0) > 0
            : false,
      attempts: group?.modelAttempts ?? 0,
      x:
        left +
        (days === 1
          ? (right - left) / 2
          : (index * (right - left)) / (days - 1)),
      y: null,
    };
  });
  const maximum = points.reduce(
    (max, point) =>
      point.value !== null && BigInt(point.value) > max
        ? BigInt(point.value)
        : max,
    BigInt(0),
  );
  const denominator = maximum || BigInt(1);
  const paths: string[] = [];
  let segment = "";
  for (const point of points) {
    if (point.value === null) {
      if (segment) paths.push(segment);
      segment = "";
      continue;
    }
    point.y =
      bottom -
      (Number((BigInt(point.value) * BigInt(1000000)) / denominator) /
        1_000_000) *
        (bottom - top);
    segment += `${segment ? " L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }
  if (segment) paths.push(segment);
  return { points, paths, maximum: maximum.toString(), width, height };
}
