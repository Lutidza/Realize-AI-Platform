/**
 * @file packages/ai-contracts/src/usage/UsageDashboard.types.ts
 * @version 1.2.0
 * @date 2026-10-06
 * @description Разделяет клиентскую аналитику и закрытую себестоимость платформы на уровне DTO.
 */
import type {
  UsageBudgetReadiness,
  UsageCost,
  UsageCostBasis,
  UsagePrice,
  UsageTokens,
} from "./UsageLedger.types";

export type UsageCostDto = Pick<
  UsageCost,
  "state" | "amountNanos" | "currency"
>;
export type UsageAmountDto = {
  basis: UsageCostBasis;
  currency: string;
  amountNanos: string;
  estimated: number;
  reconciled: number;
};
export type UsageAttemptDto = {
  attemptId: string;
  startedAt: string;
  finishedAt: string | null;
  taskId: string;
  runId: string | null;
  source: string;
  operationKey: string | null;
  model: string | null;
  workflowKey: string | null;
  workflowStepKey: string | null;
  agentProfileKey: string | null;
  attemptNumber: number;
  outcome: string;
  coverage: string;
  tokens: UsageTokens;
  durationMs: number | null;
  toolDurationMs: number | null;
  customerCost: UsageCostDto;
};
export type PlatformUsageAttemptDto = UsageAttemptDto & {
  revision: number;
  installationId: string;
  projectId: string;
  actorId: string | null;
  purpose: string;
  provider: string;
  authMode: string;
  providerCost: UsageCostDto;
  infrastructureCost: UsageCostDto;
  systemReleaseId: string | null;
  overlayReleaseId: string | null;
  platformReleaseId: string | null;
  modelCatalogRevision: string | null;
  routerPolicyVersion: string | null;
  routingDecisionId: string | null;
  priceReferences: Partial<Record<UsageCostBasis, string>>;
};
export type UsageGroupDto = {
  key: string;
  attempts: number;
  modelAttempts: number;
  failed: number;
  partial: number;
  inputTokens: string | null;
  outputTokens: string | null;
  unknownTokenAttempts: number;
  amounts: UsageAmountDto[];
};
/** Значения за период и account scope, независимо от детальных фильтров и курсора. */
export type UsageFilterOptionsDto = {
  models: string[];
  workflows: string[];
  agents: string[];
};
/** Сравниваются model attempts; платформенные checks/preview не искажают качество и кеш. */
export type UsagePeriodMetricsDto = {
  modelAttempts: number;
  completed: number;
  failed: number;
  cancelled: number;
  running: number;
  retries: number;
  inputTokens: string | null;
  outputTokens: string | null;
  unknownTokenAttempts: number;
  cacheInputTokens: string | null;
  cachedInputTokens: string | null;
  cacheMeasuredAttempts: number;
  timedAttempts: number;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
};
/** Денежные массивы уже ограничены server-owned scope и доступным cost basis. */
export type UsageAnalyticsDto = {
  current: UsagePeriodMetricsDto;
  previous: UsagePeriodMetricsDto & {
    from: string;
    to: string;
    attempts: number;
    amounts: UsageAmountDto[];
  };
  retryAmounts: UsageAmountDto[];
  unsuccessfulAmounts: UsageAmountDto[];
};
export type UsageDashboardDto = {
  view: "installation" | "platform";
  installationId: string;
  projectId: string;
  generatedAt: string;
  from: string;
  days: number;
  analytics: UsageAnalyticsDto;
  summary: {
    attempts: number;
    tasks: number;
    completed: number;
    failed: number;
    cancelled: number;
    running: number;
    retries: number;
    partial: number;
    unpriced: number;
    inputTokens: string | null;
    cachedInputTokens: string | null;
    outputTokens: string | null;
    unknownTokenAttempts: number;
    durationMs: string | null;
  };
  verifiedTasks: {
    definition: "verified_preview";
    successfulTasks: number;
    unknownByBasis: Partial<Record<UsageCostBasis, number>>;
    amounts: Array<{
      basis: UsageCostBasis;
      currency: string;
      pricedTasks: number;
      amountNanos: string;
      averageNanos: string;
    }>;
  };
  amounts: UsageAmountDto[];
  byDay: UsageGroupDto[];
  byModel: UsageGroupDto[];
  byWorkflow: UsageGroupDto[];
  byAgent: UsageGroupDto[];
  bySource: UsageGroupDto[];
  byPurpose: UsageGroupDto[];
  filterOptions: UsageFilterOptionsDto;
  items: UsageAttemptDto[];
  nextCursor: string | null;
  budgets: UsageBudgetReadiness[];
  coverage: {
    externalDevelopment: "not_connected";
    providerRetries: "not_exposed";
    childThreads: "partial";
    infrastructure: "model_checks_preview_start";
  };
};
export type PlatformUsageDashboardDto = Omit<
  UsageDashboardDto,
  "view" | "items"
> & {
  view: "platform";
  items: PlatformUsageAttemptDto[];
  prices: UsagePrice[];
};
