/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservations.types.ts
 * @version 1.3.0
 * @date 2026-11-03
 * @description Описывает серверную страницу и props диагностики поиска.
 */
import type { AdminViewServerProps } from "payload";
import type {
  SearchObservationPage,
  SearchObservationAnalytics,
  SearchQualityHistory,
  SearchAggregateHistory,
} from "@realize/ai-contracts";
export type SearchObservationsViewProps = AdminViewServerProps;
export type SearchObservationsClientProps = { apiURL: string };
export type SearchObservationDetailsProps = {
  item: SearchObservationPage["items"][number];
};
export type SearchObservationFilters = {
  source: string;
  consumer: string;
  operation: string;
  outcome: string;
  hours: string;
  from: string;
  to: string;
  slow: string;
  compareAt: string;
};
export type SearchObservationResource = {
  key: string;
  data?: SearchObservationPage;
  error?: string;
  updatedAt?: number;
};
export type SearchObservationAnalyticsProps = {
  analytics: SearchObservationAnalytics;
  retentionDays: number;
};
export type SearchObservationTrendMetric =
  "averageMs" | "completePercent" | "averageBytesRead";
export type SearchObservationMetricUnit = "ms" | "percent" | "bytes";
export type SearchObservationTrendProps = {
  analytics: SearchObservationAnalytics;
};
export type SearchQualityHistoryProps = {
  quality?: SearchQualityHistory;
  apiURL: string;
  onChange: () => void;
};
export type SearchAggregateHistoryProps = { history?: SearchAggregateHistory };

export type SearchObservationPeriod = Pick<
  SearchObservationFilters,
  "hours" | "from" | "to" | "compareAt"
>;
export type SearchObservationPeriodProps = {
  onApply: (period: SearchObservationPeriod) => void;
};
