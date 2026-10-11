/**
 * @file packages/ai-contracts/src/usage/UsageLedger.types.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Задаёт единый контракт измерений, тарифов и денежных оценок без клиентского контента.
 * @see documentation/specifications/realize-ai-commerce/v1.0/04-commercial-and-operations/25-subscriptions-and-ai-billing.md
 */
import type { z } from "zod";
import type {
  usageContextSchema,
  usageTokensSchema,
  usagePriceSchema,
  usageObservationSchema,
  usageBudgetPolicySchema,
  usageQuerySchema,
  usageReconciliationSchema,
} from "./usageLedger.schemas";

export type UsageContext = z.infer<typeof usageContextSchema>;
export type UsageTokens = z.infer<typeof usageTokensSchema>;
export type UsagePrice = z.infer<typeof usagePriceSchema>;
export type UsageObservation = z.infer<typeof usageObservationSchema>;
export type UsageBudgetPolicy = z.infer<typeof usageBudgetPolicySchema>;
export type UsageQuery = z.infer<typeof usageQuerySchema>;
export type UsageReconciliation = z.infer<typeof usageReconciliationSchema>;
export type UsageCostBasis = "provider" | "infrastructure" | "customer";
export type UsageCost = {
  state: "unknown" | "estimated" | "reconciled";
  amountNanos: string | null;
  currency: string | null;
  pricingId: string | null;
  evidenceRef: string | null;
};

/** Provider подтверждает counters; это не платёжный документ и не отдельный HTTP request. */
export type ProviderUsageMeasurement = {
  measurementId: string;
  model: string | null;
  providerThreadId: string;
  providerTurnId: string;
  tokens: UsageTokens;
  coverage: "turn" | "partial";
};

/** Durable projection восстанавливается из событий; цены фиксируются до вызова provider. */
export type UsageAttempt = {
  attemptId: string;
  context: UsageContext;
  provider: string;
  requestedModel: string | null;
  model: string | null;
  authMode: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: "running" | "completed" | "failed" | "cancelled";
  revision: number;
  observationSequence: number;
  tokens: UsageTokens;
  durationMs: number | null;
  toolDurationMs: number | null;
  coverage: "unknown" | "partial" | "turn";
  costs: Record<UsageCostBasis, UsageCost>;
  prices: Partial<Record<UsageCostBasis, UsagePrice>>;
};

export type UsageAttemptInput = Pick<
  UsageAttempt,
  | "attemptId"
  | "context"
  | "provider"
  | "requestedModel"
  | "authMode"
  | "startedAt"
>;

export type UsageReservation = {
  accountKey: string;
  attemptId: string;
  period: string;
  currency: string;
  basis: "provider" | "customer";
  amountNanos: string;
  state: "reserved" | "reconciliation" | "settled";
};

/** Garden передаёт pricingId/catalogRevision, Router — decisionId/policyVersion; null означает отсутствие. */
export type UsageBudgetReadiness = {
  policy: UsageBudgetPolicy;
  spentNanos: string;
  reservedNanos: string;
  remainingNanos: string | null;
  unresolvedAttempts: number;
  unfundedAttempts: number;
  exceeded: boolean;
};
