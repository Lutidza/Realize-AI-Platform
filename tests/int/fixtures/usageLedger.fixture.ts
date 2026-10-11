/**
 * @file tests/int/fixtures/usageLedger.fixture.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Создаёт синтетические bounded usage events и тарифы для финансовых проверок.
 */
import { randomUUID } from "node:crypto";
import type {
  UsageAttemptInput,
  UsageContext,
  UsageObservation,
  UsagePrice,
} from "@realize/ai-contracts";
import { createUsagePrice } from "@realize/change-engine";

export function usageContextFixture(
  overrides: Partial<UsageContext> = {},
): UsageContext {
  return {
    schemaVersion: "1.0",
    installationId: "fixture",
    projectId: "site",
    actorId: "42",
    purpose: "customer_runtime",
    source: "chat",
    operationKey: null,
    taskId: randomUUID(),
    runId: null,
    changeRequestId: null,
    parentAttemptId: null,
    attemptNumber: 1,
    workflowKey: null,
    workflowStepKey: null,
    agentProfileKey: null,
    platformReleaseId: "1.0.0",
    systemReleaseId: "system-1",
    systemManifestHash: "a".repeat(64),
    overlayReleaseId: "overlay-1",
    overlayManifestHash: "b".repeat(64),
    modelCatalogRevision: null,
    routerPolicyVersion: null,
    routingDecisionId: null,
    adapterVersion: "fixture:1",
    ...overrides,
  };
}
export function usageAttemptFixture(
  context: Partial<UsageContext> = {},
): UsageAttemptInput {
  return {
    attemptId: randomUUID(),
    context: usageContextFixture(context),
    provider: "openai-codex",
    requestedModel: "test-model",
    authMode: "apiKey",
    startedAt: new Date(Date.now() - 1000).toISOString(),
  };
}
export function usagePriceFixture(
  overrides: Partial<Omit<UsagePrice, "contentHash">> = {},
): UsagePrice {
  return createUsagePrice({
    schemaVersion: "1.0",
    pricingId: randomUUID(),
    installationId: "fixture",
    revision: 1,
    basis: "provider",
    provider: "openai-codex",
    model: "test-model",
    authMode: "apiKey",
    currency: "USD",
    method: "api_tariff",
    unit: "million_tokens",
    rates: {
      inputNanos: "2000000000",
      cachedInputNanos: "1000000000",
      outputNanos: "4000000000",
      secondNanos: null,
    },
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    observedAt: new Date().toISOString(),
    sourceRef: "fixture:tariff:1",
    ...overrides,
  });
}
export function usageObservationFixture(
  attemptId: string,
  overrides: Partial<UsageObservation> = {},
): UsageObservation {
  return {
    schemaVersion: "1.0",
    eventId: randomUUID(),
    attemptId,
    sequence: 1,
    observedAt: new Date().toISOString(),
    outcome: "completed",
    model: "test-model",
    tokens: {
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 50,
      reasoningOutputTokens: 10,
      totalTokens: 150,
    },
    durationMs: 1000,
    toolDurationMs: null,
    coverage: "turn",
    providerEvidence: {
      threadId: "thread-1",
      turnId: "turn-1",
      measurementId: "measure-1",
    },
    ...overrides,
  };
}
