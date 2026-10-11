/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageAnalytics.types.ts
 * @version 1.1.0
 * @date 2026-10-06
 * @description Описывает представление денежных оценок, графика и проверяемых рекомендаций дашборда.
 */
import type { UsageCostBasis } from "@realize/ai-contracts";
import type { UsageFilters, UsagePageData } from "./UsageView.types";

export type UsageTab =
  "overview" | "optimization" | "operations" | "budgets" | "pricing";
export type UsageGrouping =
  "byModel" | "byWorkflow" | "byAgent" | "bySource" | "byPurpose";
export type UsageCostSelection = {
  basis: UsageCostBasis;
  currency: string | null;
};
export type UsageCostSummary = {
  amountNanos: string | null;
  priced: number;
  applicable: number;
  unknown: number;
  state: "empty" | "complete" | "partial" | "unknown";
};
export type UsageTrendMetric = "cost" | "tokens" | "attempts";
export type UsageTrendPoint = {
  day: string;
  label: string;
  value: string | null;
  partial: boolean;
  attempts: number;
  x: number;
  y: number | null;
};
export type UsageTrend = {
  points: UsageTrendPoint[];
  paths: string[];
  maximum: string;
  width: number;
  height: number;
};
export type UsageNavigate = (
  tab: UsageTab,
  filters?: Partial<UsageFilters>,
) => void;
export type UsageAnalysisProps = {
  data: UsagePageData;
  selection: UsageCostSelection;
  onNavigate: UsageNavigate;
};
export type UsageInsight = {
  id: string;
  tone: "attention" | "positive" | "neutral";
  title: string;
  detail: string;
  value: string;
  actionLabel: string;
  tab: UsageTab;
  filters?: Partial<UsageFilters>;
};
