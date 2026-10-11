/**
 * @file packages/payload-ai-plugin/src/usage/UsageStore.types.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Отделяет PostgreSQL и внутренние metering ports от публичной аналитики.
 */
import type { Pool, PoolClient } from "pg";
import type {
  UsageAttempt,
  UsageAttemptInput,
  UsageObservation,
  UsageReconciliation,
  UsageBudgetPolicy,
  UsagePrice,
} from "@realize/ai-contracts";

export type UsageDatabase = { pool?: Pick<Pool, "connect"> };
export type UsageTransaction = PoolClient;
export type UsageAccessScope =
  | { view: "platform" }
  | { view: "installation"; installationId: string; projectId: string };
export type UsageAttemptRow = { id: number; record: UsageAttempt };
export type UsageMutationResult = {
  attempt: UsageAttempt;
  replayed: boolean;
  budgetExceeded: boolean;
};
export interface UsageWriter {
  begin(input: UsageAttemptInput): Promise<UsageAttempt>;
  observe(input: UsageObservation): Promise<UsageMutationResult>;
}
export type UsagePolicyCommand = {
  eventId: string;
  expectedRevision: number;
  policy: UsageBudgetPolicy;
  actorId: string;
};
export type UsagePriceCommand = { price: UsagePrice; actorId: string };
export type UsageReconcileCommand = {
  input: UsageReconciliation;
  actorId: string;
};
