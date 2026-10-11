/**
 * @file packages/payload-ai-plugin/src/usage/UsageBudgets.repository.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Согласует месячные бюджеты и резервы параллельных попыток в ledger transaction.
 */
import {
  usageBudgetPolicySchema,
  type UsageAttempt,
  type UsageBudgetPolicy,
  type UsageBudgetReadiness,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type {
  UsageDatabase,
  UsagePolicyCommand,
  UsageTransaction,
} from "./UsageStore.types";
import { withUsageTransaction } from "./withUsageTransaction.adapter";
import { appendUsageEvent } from "./usageLedgerEvent.repository";

export const usageAccountKey = (
  policy: Pick<
    UsageBudgetPolicy,
    "installationId" | "projectId" | "purpose" | "basis"
  >,
): string =>
  hashCanonicalJSON([
    policy.installationId,
    policy.projectId,
    policy.purpose,
    policy.basis,
  ]);

/** Периоды UTC. Поздняя сверка относится к месяцу исходной попытки. */
export async function readUsageBudget(
  client: UsageTransaction,
  policy: UsageBudgetPolicy,
  period: string,
): Promise<UsageBudgetReadiness> {
  const result = await client.query<{
    spent: string;
    reserved: string;
    unresolved: number;
    unfunded: number;
  }>(
    `WITH measured AS (
      SELECT COALESCE(sum((record->'costs'->$5->>'amountNanos')::numeric)
        FILTER (WHERE record->'costs'->$5->>'currency'=$6),0) AS spent
      FROM realize_ai_usage_attempts WHERE installation_id=$1 AND project_id=$2 AND purpose=$3 AND record->>'provider'<>'platform'
        AND started_at >= ($4 || '-01')::date AND started_at < ($4 || '-01')::date + interval '1 month'
    ), pending AS (
      SELECT COALESCE(sum(GREATEST(r.amount_nanos::numeric - CASE WHEN a.record->'costs'->$5->>'currency'=$6
        THEN COALESCE((a.record->'costs'->$5->>'amountNanos')::numeric,0) ELSE 0 END,0)),0) AS reserved,
        count(*) FILTER (WHERE r.state='reconciliation')::int AS unresolved
      FROM realize_ai_usage_reservations r JOIN realize_ai_usage_attempts a ON a.attempt_id=r.attempt_id
      WHERE r.account_key=$7 AND r.period=$4 AND r.state<>'settled'
    ), unfunded AS (
      SELECT count(*)::int AS count FROM realize_ai_usage_attempts a
      WHERE installation_id=$1 AND project_id=$2 AND purpose=$3 AND record->>'provider'<>'platform'
        AND started_at >= ($4 || '-01')::date AND started_at < ($4 || '-01')::date + interval '1 month'
        AND NOT EXISTS(SELECT 1 FROM realize_ai_usage_reservations r WHERE r.attempt_id=a.attempt_id AND r.account_key=$7)
        AND NOT COALESCE(record->'costs'->$5->>'currency'=$6 AND record->'costs'->$5->>'amountNanos' IS NOT NULL
          AND (record->'costs'->$5->>'state'='reconciled' OR (record->>'outcome'='completed' AND record->>'coverage'='turn')),false)
    ) SELECT measured.spent::text,pending.reserved::text,pending.unresolved,unfunded.count AS unfunded FROM measured,pending,unfunded`,
    [
      policy.installationId,
      policy.projectId,
      policy.purpose,
      period,
      policy.basis,
      policy.currency,
      usageAccountKey(policy),
    ],
  );
  const row = result.rows[0];
  const total = BigInt(row.spent) + BigInt(row.reserved);
  return {
    policy,
    spentNanos: row.spent,
    reservedNanos: row.reserved,
    remainingNanos:
      policy.limitNanos === null
        ? null
        : (BigInt(policy.limitNanos) - total).toString(),
    unresolvedAttempts: row.unresolved + row.unfunded,
    unfundedAttempts: row.unfunded,
    exceeded: policy.limitNanos !== null && total > BigInt(policy.limitNanos),
  };
}

export async function readAttemptBudgetPolicies(
  client: UsageTransaction,
  attempt: UsageAttempt,
): Promise<UsageBudgetPolicy[]> {
  // Эти budgets ограничивают модельные вызовы. Отдельные resource quotas относятся к delivery/billing.
  if (attempt.provider === "platform") return [];
  const rows = await client.query<{ policy: UsageBudgetPolicy }>(
    "SELECT policy FROM realize_ai_usage_budgets WHERE installation_id=$1 AND project_id=$2 AND purpose=$3",
    [
      attempt.context.installationId,
      attempt.context.projectId,
      attempt.context.purpose,
    ],
  );
  return rows.rows.map(({ policy }) => usageBudgetPolicySchema.parse(policy));
}

export async function reserveUsageBudget(
  client: UsageTransaction,
  attempt: UsageAttempt,
): Promise<void> {
  const period = attempt.startedAt.slice(0, 7);
  for (const policy of await readAttemptBudgetPolicies(client, attempt)) {
    const price = attempt.prices[policy.basis];
    const readiness = await readUsageBudget(client, policy, period);
    if (policy.mode === "hard" && policy.limitNanos !== null) {
      if (readiness.unfundedAttempts > 0)
        throw new Error("USAGE_BUDGET_RECONCILIATION_REQUIRED");
      if (!price || price.currency !== policy.currency)
        throw new Error("USAGE_BUDGET_PRICE_UNKNOWN");
      if (
        BigInt(readiness.spentNanos) +
          BigInt(readiness.reservedNanos) +
          BigInt(policy.reservationNanos) >
        BigInt(policy.limitNanos)
      )
        throw new Error("USAGE_BUDGET_EXHAUSTED");
    }
    const key = usageAccountKey(policy);
    await client.query(
      "INSERT INTO realize_ai_usage_reservations(storage_key,account_key,attempt_id,period,currency,basis,amount_nanos,state,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'reserved',now(),now())",
      [
        hashCanonicalJSON([key, attempt.attemptId]),
        key,
        attempt.attemptId,
        period,
        policy.currency,
        policy.basis,
        policy.reservationNanos,
      ],
    );
  }
}

/** Timeout/partial usage не освобождают остаток резерва; reconciled evidence разрешает settlement. */
export async function settleUsageBudget(
  client: UsageTransaction,
  attempt: UsageAttempt,
): Promise<boolean> {
  const reservations = await client.query<{
    basis: "provider" | "customer";
    currency: string;
    storage_key: string;
  }>(
    "SELECT basis,currency,storage_key FROM realize_ai_usage_reservations WHERE attempt_id=$1",
    [attempt.attemptId],
  );
  for (const row of reservations.rows) {
    const cost = attempt.costs[row.basis];
    const known = cost.state !== "unknown" && cost.currency === row.currency;
    const finished = attempt.outcome !== "running";
    const settled =
      finished &&
      known &&
      (cost.state === "reconciled" ||
        (finished &&
          attempt.outcome === "completed" &&
          attempt.coverage === "turn"));
    await client.query(
      "UPDATE realize_ai_usage_reservations SET state=$2,updated_at=now() WHERE storage_key=$1",
      [
        row.storage_key,
        settled ? "settled" : finished ? "reconciliation" : "reserved",
      ],
    );
  }
  for (const policy of await readAttemptBudgetPolicies(client, attempt)) {
    if (
      policy.mode === "hard" &&
      (await readUsageBudget(client, policy, attempt.startedAt.slice(0, 7)))
        .exceeded
    )
      return true;
  }
  return false;
}

export class UsageBudgetsRepository {
  constructor(private readonly database: UsageDatabase) {}

  async update(command: UsagePolicyCommand): Promise<UsageBudgetPolicy> {
    const policy = usageBudgetPolicySchema.parse(command.policy);
    if (policy.revision !== command.expectedRevision + 1)
      throw new Error("USAGE_BUDGET_REVISION_INVALID");
    return withUsageTransaction(this.database, async (client) => {
      const key = usageAccountKey(policy);
      const inserted = await appendUsageEvent(
        client,
        command.eventId,
        key,
        "budget_changed",
        command,
      );
      if (!inserted) return policy;
      const current = await client.query<{ policy: UsageBudgetPolicy }>(
        "SELECT policy FROM realize_ai_usage_budgets WHERE account_key=$1",
        [key],
      );
      const previous = current.rows[0]?.policy;
      if ((previous?.revision ?? 0) !== command.expectedRevision)
        throw new Error("USAGE_BUDGET_CONFLICT");
      if (previous && previous.currency !== policy.currency)
        throw new Error("USAGE_BUDGET_CURRENCY_IMMUTABLE");
      await client.query(
        `INSERT INTO realize_ai_usage_budgets(account_key,installation_id,project_id,purpose,basis,policy,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,now(),now()) ON CONFLICT(account_key) DO UPDATE SET policy=EXCLUDED.policy,updated_at=now()`,
        [
          key,
          policy.installationId,
          policy.projectId,
          policy.purpose,
          policy.basis,
          JSON.stringify(policy),
        ],
      );
      return policy;
    });
  }
}
