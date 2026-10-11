/**
 * @file packages/payload-ai-plugin/src/usage/UsageLedger.repository.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Связывает append-only события с durable попыткой и атомарным резервом бюджета.
 */
import { z } from "zod";
import {
  usageContextSchema,
  usageObservationSchema,
  usageReconciliationSchema,
  usageAbandonSchema,
  type UsageAttempt,
  type UsageAttemptInput,
  type UsageObservation,
} from "@realize/ai-contracts";
import { hashCanonicalJSON, unknownUsageCost } from "@realize/change-engine";
import type {
  UsageDatabase,
  UsageAttemptRow,
  UsageWriter,
  UsageReconcileCommand,
  UsageMutationResult,
} from "./UsageStore.types";
import { withUsageTransaction } from "./withUsageTransaction.adapter";
import { appendUsageEvent } from "./usageLedgerEvent.repository";
import { readUsagePrices } from "./UsagePricing.repository";
import {
  reserveUsageBudget,
  settleUsageBudget,
} from "./UsageBudgets.repository";
import { projectUsageObservation } from "./projectUsageObservation.mapper";

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/);
const attemptInputSchema = z.strictObject({
  attemptId: identifier,
  context: usageContextSchema,
  provider: identifier,
  requestedModel: identifier.nullable(),
  authMode: identifier,
  startedAt: z.iso.datetime({ offset: false }),
});

export class UsageLedgerRepository implements UsageWriter {
  constructor(private readonly database: UsageDatabase) {}

  async begin(value: UsageAttemptInput): Promise<UsageAttempt> {
    const input = attemptInputSchema.parse(value);
    return withUsageTransaction(this.database, async (client) => {
      const previous = await client.query<UsageAttemptRow>(
        "SELECT id,record FROM realize_ai_usage_attempts WHERE attempt_id=$1",
        [input.attemptId],
      );
      if (previous.rows[0]) throw new Error("USAGE_ATTEMPT_ALREADY_STARTED");
      const count = await client.query<{ count: number }>(
        "SELECT count(*)::int FROM realize_ai_usage_attempts WHERE installation_id=$1 AND project_id=$2 AND task_id=$3 AND source=$4 AND purpose=$5 AND (record->'context'->>'operationKey') IS NOT DISTINCT FROM $6",
        [
          input.context.installationId,
          input.context.projectId,
          input.context.taskId,
          input.context.source,
          input.context.purpose,
          input.context.operationKey,
        ],
      );
      input.context.attemptNumber = count.rows[0].count + 1;
      const attempt: UsageAttempt = {
        ...input,
        model: input.requestedModel,
        revision: 0,
        observationSequence: 0,
        outcome: "running",
        finishedAt: null,
        tokens: {
          inputTokens: null,
          cachedInputTokens: null,
          outputTokens: null,
          reasoningOutputTokens: null,
          totalTokens: null,
        },
        coverage: "unknown",
        durationMs: null,
        toolDurationMs: null,
        costs: {
          provider: unknownUsageCost(),
          infrastructure: unknownUsageCost(),
          customer: unknownUsageCost(),
        },
        prices: await readUsagePrices(client, input),
      };
      // Admission предшествует provider call. Повтор попытки не является разрешением повторить вызов.
      await reserveUsageBudget(client, attempt);
      await appendUsageEvent(
        client,
        `start:${input.attemptId}`,
        input.attemptId,
        "attempt_started",
        input,
      );
      await client.query(
        "INSERT INTO realize_ai_usage_attempts(attempt_id,installation_id,project_id,purpose,source,task_id,started_at,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now(),now())",
        [
          input.attemptId,
          input.context.installationId,
          input.context.projectId,
          input.context.purpose,
          input.context.source,
          input.context.taskId,
          input.startedAt,
          JSON.stringify(attempt),
        ],
      );
      return attempt;
    });
  }

  async observe(value: UsageObservation): Promise<UsageMutationResult> {
    const observation = usageObservationSchema.parse(value);
    return withUsageTransaction(this.database, async (client) => {
      const result = await client.query<UsageAttemptRow>(
        "SELECT id,record FROM realize_ai_usage_attempts WHERE attempt_id=$1 FOR UPDATE",
        [observation.attemptId],
      );
      const current = result.rows[0]?.record;
      if (!current) throw new Error("USAGE_ATTEMPT_NOT_FOUND");
      if (
        Date.parse(observation.observedAt) < Date.parse(current.startedAt) ||
        Date.parse(observation.observedAt) > Date.now() + 300000
      )
        throw new Error("USAGE_OBSERVATION_TIME_INVALID");
      const created = await appendUsageEvent(
        client,
        observation.eventId,
        observation.attemptId,
        "observation",
        observation,
      );
      if (!created)
        return {
          attempt: current,
          replayed: true,
          budgetExceeded: await settleUsageBudget(client, current),
        };
      if (observation.sequence === current.observationSequence)
        throw new Error("USAGE_SEQUENCE_CONFLICT");
      // Доставка старого cumulative snapshot сохраняет evidence, но не откатывает projection.
      if (observation.sequence < current.observationSequence)
        return { attempt: current, replayed: false, budgetExceeded: false };
      const attempt = projectUsageObservation(current, observation);
      await client.query(
        "UPDATE realize_ai_usage_attempts SET record=$2::jsonb,updated_at=now() WHERE attempt_id=$1",
        [attempt.attemptId, JSON.stringify(attempt)],
      );
      const budgetExceeded = await settleUsageBudget(client, attempt);
      return { attempt, replayed: false, budgetExceeded };
    });
  }

  async reconcile({
    input: value,
    actorId,
  }: UsageReconcileCommand): Promise<UsageAttempt> {
    const input = usageReconciliationSchema.parse(value);
    return withUsageTransaction(this.database, async (client) => {
      const result = await client.query<UsageAttemptRow>(
        "SELECT id,record FROM realize_ai_usage_attempts WHERE attempt_id=$1 FOR UPDATE",
        [input.attemptId],
      );
      const current = result.rows[0]?.record;
      if (!current) throw new Error("USAGE_ATTEMPT_NOT_FOUND");
      if (
        Date.parse(input.observedAt) < Date.parse(current.startedAt) ||
        Date.parse(input.observedAt) > Date.now() + 300000
      )
        throw new Error("USAGE_RECONCILIATION_TIME_INVALID");
      if (
        !(await appendUsageEvent(
          client,
          input.eventId,
          input.attemptId,
          "cost_reconciled",
          { input, actorId },
        ))
      )
        return current;
      if (current.revision !== input.expectedRevision)
        throw new Error("USAGE_REVISION_CONFLICT");
      if (current.outcome === "running")
        throw new Error("USAGE_RUNNING_RECONCILIATION_DENIED");
      const prior = current.costs[input.basis];
      if (prior.currency && prior.currency !== input.currency)
        throw new Error("USAGE_RECONCILIATION_CURRENCY_MISMATCH");
      const attempt: UsageAttempt = {
        ...current,
        revision: current.revision + 1,
        costs: {
          ...current.costs,
          [input.basis]: {
            state: "reconciled",
            amountNanos: input.amountNanos,
            currency: input.currency,
            pricingId: prior.pricingId,
            evidenceRef: input.evidenceRef,
          },
        },
      };
      await client.query(
        "UPDATE realize_ai_usage_attempts SET record=$2::jsonb,updated_at=now() WHERE attempt_id=$1",
        [input.attemptId, JSON.stringify(attempt)],
      );
      await settleUsageBudget(client, attempt);
      return attempt;
    });
  }

  /** Owner подтверждает остановку процесса отдельно. Timeout сам по себе не является таким доказательством. */
  async abandon(value: unknown, actorId: string): Promise<UsageAttempt> {
    const input = usageAbandonSchema.parse(value);
    return withUsageTransaction(this.database, async (client) => {
      const result = await client.query<UsageAttemptRow>(
        "SELECT id,record FROM realize_ai_usage_attempts WHERE attempt_id=$1 FOR UPDATE",
        [input.attemptId],
      );
      const current = result.rows[0]?.record;
      if (!current) throw new Error("USAGE_ATTEMPT_NOT_FOUND");
      if (
        !(await appendUsageEvent(
          client,
          input.eventId,
          input.attemptId,
          "attempt_abandoned",
          { input, actorId },
        ))
      )
        return current;
      if (
        current.outcome !== "running" ||
        current.revision !== input.expectedRevision
      )
        throw new Error("USAGE_REVISION_CONFLICT");
      if (
        Date.parse(input.observedAt) < Date.parse(current.startedAt) ||
        Date.parse(input.observedAt) > Date.now() + 300000
      )
        throw new Error("USAGE_RECONCILIATION_TIME_INVALID");
      const attempt: UsageAttempt = {
        ...current,
        outcome: "failed",
        coverage: current.coverage === "unknown" ? "unknown" : "partial",
        finishedAt: input.observedAt,
        revision: current.revision + 1,
      };
      await client.query(
        "UPDATE realize_ai_usage_attempts SET record=$2::jsonb,updated_at=now() WHERE attempt_id=$1",
        [input.attemptId, JSON.stringify(attempt)],
      );
      await settleUsageBudget(client, attempt);
      return attempt;
    });
  }

  /** Отдельный audit key позволяет проверить сохранённый запрос без повторного provider call. */
  static fingerprint(input: UsageAttemptInput): string {
    return hashCanonicalJSON(attemptInputSchema.parse(input));
  }
}
