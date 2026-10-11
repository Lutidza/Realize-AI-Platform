/**
 * @file tests/int/fixtures/usageAnalytics.fixture.ts
 * @version 1.1.0
 * @date 2026-10-06
 * @description Создаёт синтетический DTO для проверки финансового отображения, не заменяя native ledger evidence.
 */
import type {
  UsageDashboardDto,
  UsagePeriodMetricsDto,
} from "@realize/ai-contracts";

export function usageMetricsFixture(
  overrides: Partial<UsagePeriodMetricsDto> = {},
): UsagePeriodMetricsDto {
  return {
    modelAttempts: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    running: 0,
    retries: 0,
    inputTokens: null,
    outputTokens: null,
    unknownTokenAttempts: 0,
    cacheInputTokens: null,
    cachedInputTokens: null,
    cacheMeasuredAttempts: 0,
    timedAttempts: 0,
    p50DurationMs: null,
    p95DurationMs: null,
    ...overrides,
  };
}
export function usageAnalyticsFixture(
  overrides: Partial<UsageDashboardDto> = {},
): UsageDashboardDto {
  return {
    view: "installation",
    installationId: "fixture",
    projectId: "site",
    generatedAt: "2026-10-05T12:00:00.000Z",
    from: "2026-10-03T12:00:00.000Z",
    days: 2,
    summary: {
      attempts: 0,
      tasks: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      running: 0,
      retries: 0,
      partial: 0,
      unpriced: 0,
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      unknownTokenAttempts: 0,
      durationMs: null,
    },
    analytics: {
      current: usageMetricsFixture(),
      previous: {
        ...usageMetricsFixture(),
        from: "2026-10-01T12:00:00.000Z",
        to: "2026-10-03T12:00:00.000Z",
        attempts: 0,
        amounts: [],
      },
      retryAmounts: [],
      unsuccessfulAmounts: [],
    },
    verifiedTasks: {
      definition: "verified_preview",
      successfulTasks: 0,
      unknownByBasis: { customer: 0 },
      amounts: [],
    },
    amounts: [],
    byDay: [],
    byModel: [],
    byWorkflow: [],
    byAgent: [],
    bySource: [],
    byPurpose: [],
    filterOptions: { models: [], workflows: [], agents: [] },
    items: [],
    nextCursor: null,
    budgets: [],
    coverage: {
      externalDevelopment: "not_connected",
      providerRetries: "not_exposed",
      childThreads: "partial",
      infrastructure: "model_checks_preview_start",
    },
    ...overrides,
  };
}
