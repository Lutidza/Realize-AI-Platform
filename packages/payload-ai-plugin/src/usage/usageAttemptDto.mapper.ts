/**
 * @file packages/payload-ai-plugin/src/usage/usageAttemptDto.mapper.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Формирует allowlist DTO; клиентская проекция не содержит себестоимости и тарифных источников.
 */
import type {
  UsageAttempt,
  UsageAttemptDto,
  PlatformUsageAttemptDto,
  UsageCost,
  UsageCostDto,
} from "@realize/ai-contracts";

const costDto = (value: UsageCost): UsageCostDto => ({
  state: value.state,
  amountNanos: value.amountNanos,
  currency: value.currency,
});
export function usageAttemptDto(attempt: UsageAttempt): UsageAttemptDto {
  const c = attempt.context;
  return {
    attemptId: attempt.attemptId,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    taskId: c.taskId,
    runId: c.runId,
    source: c.source,
    operationKey: c.operationKey ?? null,
    model: attempt.model,
    workflowKey: c.workflowKey,
    workflowStepKey: c.workflowStepKey,
    agentProfileKey: c.agentProfileKey,
    attemptNumber: c.attemptNumber,
    outcome: attempt.outcome,
    coverage: attempt.coverage,
    tokens: {
      inputTokens: attempt.tokens.inputTokens,
      cachedInputTokens: attempt.tokens.cachedInputTokens,
      outputTokens: attempt.tokens.outputTokens,
      reasoningOutputTokens: attempt.tokens.reasoningOutputTokens,
      totalTokens: attempt.tokens.totalTokens,
    },
    durationMs: attempt.durationMs,
    toolDurationMs: attempt.toolDurationMs,
    customerCost: costDto(attempt.costs.customer),
  };
}
export function platformUsageAttemptDto(
  attempt: UsageAttempt,
): PlatformUsageAttemptDto {
  const c = attempt.context;
  return {
    ...usageAttemptDto(attempt),
    revision: attempt.revision,
    installationId: c.installationId,
    projectId: c.projectId,
    actorId: c.actorId,
    purpose: c.purpose,
    provider: attempt.provider,
    authMode: attempt.authMode,
    providerCost: costDto(attempt.costs.provider),
    infrastructureCost: costDto(attempt.costs.infrastructure),
    systemReleaseId: c.systemReleaseId,
    overlayReleaseId: c.overlayReleaseId,
    platformReleaseId: c.platformReleaseId,
    modelCatalogRevision: c.modelCatalogRevision,
    routerPolicyVersion: c.routerPolicyVersion,
    routingDecisionId: c.routingDecisionId,
    priceReferences: Object.fromEntries(
      Object.entries(attempt.prices).map(([basis, price]) => [
        basis,
        price.pricingId,
      ]),
    ),
  };
}
