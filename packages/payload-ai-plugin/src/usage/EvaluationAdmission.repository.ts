/**
 * @file packages/payload-ai-plugin/src/usage/EvaluationAdmission.repository.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет наличие eval budget и durable резерва перед платным provider turn.
 */
import {
  usageBudgetPolicySchema,
  type UsageAttempt,
} from "@realize/ai-contracts";
import type { UsageDatabase } from "./UsageStore.types";
import { withUsageTransaction } from "./withUsageTransaction.adapter";

/** Admission ledger остаётся единственным владельцем резервов; этот reader не меняет бюджеты. */
export class EvaluationAdmissionRepository {
  constructor(private readonly database: UsageDatabase) {}
  async hasHardBudget(
    installationId: string,
    projectId: string,
  ): Promise<boolean> {
    return withUsageTransaction(
      this.database,
      async (client) => {
        const { rows } = await client.query<{ policy: unknown }>(
          "SELECT policy FROM realize_ai_usage_budgets WHERE installation_id=$1 AND project_id=$2 AND purpose='evaluation' AND basis='provider'",
          [installationId, projectId],
        );
        return rows.some((row) => {
          const policy = usageBudgetPolicySchema.parse(row.policy);
          return (
            policy.mode === "hard" &&
            policy.limitNanos !== null &&
            BigInt(policy.reservationNanos) > BigInt(0)
          );
        });
      },
      true,
    );
  }
  async requireReservation(attempt: UsageAttempt): Promise<void> {
    if (attempt.context.purpose !== "evaluation" || !attempt.prices.provider)
      throw new Error("EVAL_PRICED_RESERVATION_REQUIRED");
    await withUsageTransaction(
      this.database,
      async (client) => {
        const { rows } = await client.query<{
          policy: unknown;
          currency: string;
        }>(
          "SELECT b.policy,r.currency FROM realize_ai_usage_reservations r JOIN realize_ai_usage_budgets b ON b.account_key=r.account_key WHERE r.attempt_id=$1 AND r.basis='provider' AND r.state='reserved' AND r.amount_nanos::numeric>0",
          [attempt.attemptId],
        );
        if (
          !rows.some((row) => {
            const policy = usageBudgetPolicySchema.parse(row.policy);
            return (
              policy.purpose === "evaluation" &&
              policy.mode === "hard" &&
              policy.limitNanos !== null &&
              row.currency === attempt.prices.provider!.currency
            );
          })
        )
          throw new Error("EVAL_PRICED_RESERVATION_REQUIRED");
      },
      true,
    );
  }
}
