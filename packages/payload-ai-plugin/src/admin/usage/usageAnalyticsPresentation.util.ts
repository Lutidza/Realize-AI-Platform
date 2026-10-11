/**
 * @file packages/payload-ai-plugin/src/admin/usage/usageAnalyticsPresentation.util.ts
 * @version 1.1.0
 * @date 2026-10-06
 * @description Форматирует точные значения дашборда и отношения без сложения валют или округления неизвестного к нулю.
 */
import { usageGroupKeys } from "@realize/ai-contracts";
import type { UsageGrouping } from "./UsageAnalytics.types";
import { usagePurposeLabels, usageSourceLabels } from "./usageLabels.config";

const integer = new Intl.NumberFormat("ru-RU");
const compact = new Intl.NumberFormat("ru-RU", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatUsageCount = (
  value: number | string | null,
  short = false,
) =>
  value === null
    ? "—"
    : (short ? compact : integer).format(
        typeof value === "string" ? BigInt(value) : value,
      );

/** Округление только отображения; исходные nanos остаются в DTO, title и детализации. */
export function formatUsageAmount(
  value: string | null,
  currency: string | null,
) {
  if (value === null || currency === null) return "Не рассчитано";
  const signed = BigInt(value);
  const amount = signed < BigInt(0) ? -signed : signed;
  if (amount > BigInt(0) && amount < BigInt(10000000))
    return `< 0,01 ${currency}`;
  const cents = (amount + BigInt(5000000)) / BigInt(10000000);
  return `${signed < BigInt(0) ? "−" : ""}${integer.format(cents / BigInt(100))},${String(cents % BigInt(100)).padStart(2, "0")} ${currency}`;
}

export function usagePercent(
  part: string | number | null,
  whole: string | number | null,
): number | null {
  if (part === null || whole === null || BigInt(whole) <= BigInt(0))
    return null;
  return Number((BigInt(part) * BigInt(1000)) / BigInt(whole)) / 10;
}

export function usageChange(
  current: string | number | null,
  previous: string | number | null,
): string | null {
  if (current === null || previous === null || BigInt(previous) <= BigInt(0))
    return null;
  const value =
    Number(
      ((BigInt(current) - BigInt(previous)) * BigInt(1000)) / BigInt(previous),
    ) / 10;
  return `${value > 0 ? "+" : ""}${value.toLocaleString("ru-RU")}%`;
}

/** Cached input уже входит во вход, повторно прибавлять его к общим токенам нельзя. */
export function observedUsageTokens(
  input: string | null,
  output: string | null,
): string | null {
  return input === null && output === null
    ? null
    : (BigInt(input ?? "0") + BigInt(output ?? "0")).toString();
}

export const formatUsageDuration = (ms: number | null) =>
  ms === null
    ? "—"
    : ms < 1000
      ? `${Math.round(ms)} мс`
      : ms < 60000
        ? `${(ms / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`
        : `${(ms / 60000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} мин`;

export function usageGroupLabel(key: string, group: UsageGrouping) {
  if (group === "byPurpose") return usagePurposeLabels[key] ?? key;
  if (group === "bySource") return usageSourceLabels[key] ?? key;
  if (group === "byModel" && key === usageGroupKeys.noModel)
    return "Без вызова модели";
  if (key !== usageGroupKeys.unassigned) return key;
  return group === "byAgent"
    ? "Без профиля агента"
    : group === "byWorkflow"
      ? "Без процесса"
      : "Модель не подтверждена";
}
