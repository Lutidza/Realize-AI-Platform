/**
 * @file packages/payload-ai-plugin/src/usage/projectUsageObservation.mapper.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Обновляет cumulative measurement без повторного сложения usage и пересчёта сверенной стоимости.
 */
import type {
  UsageAttempt,
  UsageObservation,
  UsageCostBasis,
} from "@realize/ai-contracts";
import { calculateUsageCost, unknownUsageCost } from "@realize/change-engine";

export function projectUsageObservation(
  current: UsageAttempt,
  observation: UsageObservation,
): UsageAttempt {
  if (current.outcome !== "running")
    throw new Error("USAGE_TERMINAL_OBSERVATION_REQUIRES_RECONCILIATION");
  for (const key of [
    "inputTokens",
    "cachedInputTokens",
    "outputTokens",
    "totalTokens",
  ] as const) {
    const next = observation.tokens[key];
    const previous = current.tokens[key];
    if (next !== null && previous !== null && next < previous)
      throw new Error("USAGE_COUNTER_DECREASE");
  }
  const costs = { ...current.costs };
  for (const basis of [
    "provider",
    "infrastructure",
    "customer",
  ] as UsageCostBasis[]) {
    if (costs[basis].state === "reconciled") continue;
    const price = current.prices[basis];
    // Неизвестная/сменившаяся модель не наследует цену выбранной в начале модели.
    costs[basis] =
      basis !== "infrastructure" &&
      (!observation.model || price?.model !== observation.model)
        ? unknownUsageCost()
        : calculateUsageCost(price, observation.tokens, observation.durationMs);
  }
  return {
    ...current,
    model: observation.model,
    outcome: observation.outcome,
    tokens: observation.tokens,
    durationMs: observation.durationMs,
    toolDurationMs: observation.toolDurationMs,
    coverage: observation.coverage,
    costs,
    observationSequence: observation.sequence,
    revision: current.revision + 1,
    finishedAt:
      observation.outcome === "running" ? null : observation.observedAt,
  };
}
