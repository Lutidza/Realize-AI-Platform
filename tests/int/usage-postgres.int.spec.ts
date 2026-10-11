/**
 * @file tests/int/usage-postgres.int.spec.ts
 * @version 1.3.1
 * @date 2026-10-11
 * @description Проверяет полный migration chain, атомарные бюджеты, immutable evidence и разделение выдачи в PostgreSQL.
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { MigrateUpArgs } from "@payloadcms/db-postgres";
import {
  usageGroupKeys,
  type UsageBudgetPolicy,
  type UsageContext,
} from "@realize/ai-contracts";
import { migrations } from "../../src/migrations";
import { up, down } from "../../src/migrations/20261004_210727_ai_usage_ledger";
import { UsageLedgerRepository } from "../../packages/payload-ai-plugin/src/usage/UsageLedger.repository";
import { UsageBudgetsRepository } from "../../packages/payload-ai-plugin/src/usage/UsageBudgets.repository";
import { UsagePricingRepository } from "../../packages/payload-ai-plugin/src/usage/UsagePricing.repository";
import { UsageDashboardRepository } from "../../packages/payload-ai-plugin/src/usage/UsageDashboard.repository";
import { EvaluationAdmissionRepository } from "@realize/payload-ai-control/server/usage";
import {
  usageAttemptFixture,
  usagePriceFixture,
  usageObservationFixture,
} from "./fixtures/usageLedger.fixture";
import { measureUsageOperation } from "../../packages/payload-ai-plugin/src/usage/measureUsageOperation.service";
import { recordVerifiedPreviewUsage } from "../../packages/payload-ai-plugin/src/usage/recordVerifiedPreviewUsage.service";

describe.skipIf(!process.env.USAGE_TEST_DATABASE_URI)(
  "usage ledger on isolated PostgreSQL",
  () => {
    let pool: Pool;
    let ledger: UsageLedgerRepository;
    let pricing: UsagePricingRepository;
    let budgets: UsageBudgetsRepository;
    let dashboard: UsageDashboardRepository;
    const migrate = async (client: PoolClient, operation: typeof up) => {
      const dialect = new PgDialect();
      await client.query("BEGIN");
      try {
        await operation({
          db: {
            execute: async (statement) => {
              if (typeof statement === "string") return client.query(statement);
              const query = dialect.sqlToQuery(statement.getSQL());
              return client.query(query.sql, query.params);
            },
          },
        } as MigrateUpArgs);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    };
    beforeAll(async () => {
      const uri = new URL(process.env.USAGE_TEST_DATABASE_URI!);
      if (
        uri.hostname !== "127.0.0.1" ||
        !/^realize_usage_fixture_[a-z0-9]+$/.test(uri.pathname.slice(1)) ||
        process.env.DATABASE_URI !== uri.href
      )
        throw new Error("ISOLATED_USAGE_DATABASE_REQUIRED");
      pool = new Pool({ connectionString: uri.href, max: 8 });
      const client = await pool.connect();
      try {
        // Harness создаёт новую пустую БД; повтор не очищает финансовую историю.
        expect(
          (
            await client.query(
              "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'",
            )
          ).rows[0].count,
        ).toBe(0);
        for (const migration of migrations) await migrate(client, migration.up);
        await migrate(client, down);
        await migrate(client, up);
      } finally {
        client.release();
      }
      ledger = new UsageLedgerRepository({ pool });
      pricing = new UsagePricingRepository({ pool });
      budgets = new UsageBudgetsRepository({ pool });
      dashboard = new UsageDashboardRepository({ pool });
    }, 60000);
    afterAll(async () => {
      await pool?.end();
    });
    const prepare = async (installationId: string, limit = "1000000000") => {
      const price = usagePriceFixture({ installationId });
      await pricing.publish({ price, actorId: "owner" });
      const policy: UsageBudgetPolicy = {
        schemaVersion: "1.0",
        installationId,
        projectId: "site",
        purpose: "customer_runtime",
        basis: "provider",
        currency: "USD",
        revision: 1,
        mode: "hard",
        limitNanos: limit,
        reservationNanos: "1000000000",
      };
      await budgets.update({
        eventId: randomUUID(),
        actorId: "owner",
        expectedRevision: 0,
        policy,
      });
      return { price, policy };
    };
    it("serializes competing admissions and rejects an unpriced model", async () => {
      const installationId = randomUUID();
      await prepare(installationId);
      const attempts = [
        usageAttemptFixture({ installationId }),
        usageAttemptFixture({ installationId }),
      ];
      const result = await Promise.allSettled(
        attempts.map((attempt) => ledger.begin(attempt)),
      );
      expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(
        1,
      );
      expect(result.filter((item) => item.status === "rejected")).toHaveLength(
        1,
      );
      const rejected = usageAttemptFixture({ installationId });
      rejected.requestedModel = "unknown-model";
      await expect(ledger.begin(rejected)).rejects.toThrow(
        "USAGE_BUDGET_PRICE_UNKNOWN",
      );
      const stored = await pool.query(
        "SELECT count(*)::int AS count FROM realize_ai_usage_attempts WHERE installation_id=$1",
        [installationId],
      );
      expect(stored.rows[0].count).toBe(1);
    });
    it("does not double count duplicate or late snapshots and keeps original price", async () => {
      const installationId = randomUUID();
      const { price } = await prepare(installationId, "5000000000");
      const attempt = await ledger.begin(
        usageAttemptFixture({ installationId }),
      );
      const running = usageObservationFixture(attempt.attemptId, {
        outcome: "running",
      });
      await ledger.observe(running);
      expect((await ledger.observe(running)).replayed).toBe(true);
      await expect(
        ledger.observe({
          ...running,
          tokens: { ...running.tokens, inputTokens: 200 },
        }),
      ).rejects.toThrow("USAGE_EVENT_CONFLICT");
      await pricing.publish({
        actorId: "owner",
        price: usagePriceFixture({
          installationId,
          revision: 2,
          rates: { ...price.rates, outputNanos: "9000000000" },
        }),
      });
      const final = usageObservationFixture(attempt.attemptId, { sequence: 3 });
      expect(
        (await ledger.observe(final)).attempt.costs.provider.amountNanos,
      ).toBe("380000");
      const late = await ledger.observe(
        usageObservationFixture(attempt.attemptId, {
          sequence: 2,
          outcome: "running",
        }),
      );
      expect(late.attempt.outcome).toBe("completed");
      const view = await dashboard.read(
        { view: "platform" },
        { days: 30, installationId },
      );
      expect(
        view.amounts.find((amount) => amount.basis === "provider")?.amountNanos,
      ).toBe("380000");
      expect(view.budgets[0].reservedNanos).toBe("0");
      expect(view.byModel[0].amounts[0].amountNanos).toBe("380000");
    });
    it("retains failed/partial reservation, reconciles once, and enforces immutable evidence", async () => {
      const installationId = randomUUID();
      const { price } = await prepare(installationId);
      const attempt = await ledger.begin(
        usageAttemptFixture({ installationId }),
      );
      const result = await ledger.observe(
        usageObservationFixture(attempt.attemptId, {
          outcome: "failed",
          coverage: "partial",
        }),
      );
      const before = await dashboard.read(
        { view: "platform" },
        { days: 30, installationId },
      );
      expect(before.budgets[0].reservedNanos).toBe("999620000");
      expect(before.budgets[0].unresolvedAttempts).toBe(1);
      await expect(
        ledger.begin(usageAttemptFixture({ installationId })),
      ).rejects.toThrow("USAGE_BUDGET_EXHAUSTED");
      const command = {
        actorId: "owner",
        input: {
          eventId: randomUUID(),
          attemptId: attempt.attemptId,
          expectedRevision: result.attempt.revision,
          basis: "provider" as const,
          amountNanos: "100",
          currency: "USD",
          evidenceRef: "invoice:fixture",
          observedAt: new Date().toISOString(),
        },
      };
      const revised = await ledger.reconcile(command);
      expect((await ledger.reconcile(command)).revision).toBe(revised.revision);
      expect(
        (
          await dashboard.read(
            { view: "platform" },
            { days: 30, installationId },
          )
        ).budgets[0].reservedNanos,
      ).toBe("0");
      await expect(
        pool.query("DELETE FROM realize_ai_usage_events WHERE subject_key=$1", [
          attempt.attemptId,
        ]),
      ).rejects.toThrow("USAGE_EVIDENCE_IMMUTABLE");
      await expect(
        pool.query(
          "UPDATE realize_ai_usage_prices SET model='tampered' WHERE pricing_id=$1",
          [price.pricingId],
        ),
      ).rejects.toThrow("USAGE_EVIDENCE_IMMUTABLE");
      const client = await pool.connect();
      try {
        await expect(migrate(client, down)).rejects.toThrow(
          "USAGE_LEDGER_ROLLBACK_BLOCKED",
        );
      } finally {
        client.release();
      }
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM realize_ai_usage_attempts WHERE attempt_id=$1",
            [attempt.attemptId],
          )
        ).rows[0].count,
      ).toBe(1);
    });
    it("counts late overrun in full and blocks subsequent attempts", async () => {
      const installationId = randomUUID();
      await prepare(installationId);
      const attempt = await ledger.begin(
        usageAttemptFixture({ installationId }),
      );
      const result = await ledger.observe(
        usageObservationFixture(attempt.attemptId, {
          tokens: {
            inputTokens: 1000000,
            cachedInputTokens: 0,
            outputTokens: 1000000,
            reasoningOutputTokens: 0,
            totalTokens: 2000000,
          },
        }),
      );
      expect(result.budgetExceeded).toBe(true);
      expect(result.attempt.costs.provider.amountNanos).toBe("6000000000");
      await expect(
        ledger.begin(usageAttemptFixture({ installationId })),
      ).rejects.toThrow("USAGE_BUDGET_EXHAUSTED");
    });
    it("does not turn prior unknown usage into free capacity when enabling a budget", async () => {
      const installationId = randomUUID();
      const attempt = await ledger.begin(
        usageAttemptFixture({ installationId }),
      );
      await ledger.observe(usageObservationFixture(attempt.attemptId));
      await prepare(installationId);
      await expect(
        ledger.begin(usageAttemptFixture({ installationId })),
      ).rejects.toThrow("USAGE_BUDGET_RECONCILIATION_REQUIRED");
    });
    it("recovers a stopped process with audit but holds reservation until reconciliation", async () => {
      const installationId = randomUUID();
      await prepare(installationId);
      const attempt = await ledger.begin(
        usageAttemptFixture({ installationId }),
      );
      const command = {
        eventId: randomUUID(),
        attemptId: attempt.attemptId,
        expectedRevision: attempt.revision,
        runtimeStopped: true,
        observedAt: new Date().toISOString(),
        evidenceRef: "incident:fixture:stopped",
      };
      await expect(
        ledger.abandon({ ...command, runtimeStopped: false }, "owner"),
      ).rejects.toThrow();
      expect((await ledger.abandon(command, "owner")).outcome).toBe("failed");
      expect((await ledger.abandon(command, "owner")).revision).toBe(1);
      const view = await dashboard.read(
        { view: "platform" },
        { days: 30, installationId },
      );
      expect(view.budgets[0].reservedNanos).toBe("1000000000");
      expect(view.budgets[0].unresolvedAttempts).toBe(1);
      await expect(
        ledger.observe(usageObservationFixture(attempt.attemptId)),
      ).rejects.toThrow("USAGE_TERMINAL_OBSERVATION_REQUIRES_RECONCILIATION");
    });
    it("shows evaluation costs only to the platform owner with ledger retry identity", async () => {
      const installationId = randomUUID();
      const input = usageAttemptFixture({
        installationId,
        purpose: "evaluation",
        source: "evaluation",
        operationKey: "read-recovery:0",
      });
      const attempt = await ledger.begin(input);
      await ledger.observe(usageObservationFixture(attempt.attemptId));
      const second = await ledger.begin({ ...input, attemptId: randomUUID() });
      expect(second.context.attemptNumber).toBe(2);
      await ledger.observe(usageObservationFixture(second.attemptId));
      const owner = await dashboard.read(
        { view: "platform" },
        { days: 30, installationId, purpose: "evaluation" },
      );
      expect(owner.items.map((item) => item.attemptId).sort()).toEqual(
        [attempt.attemptId, second.attemptId].sort(),
      );
      expect(owner.summary.unpriced).toBe(2);
      const customer = await dashboard.read(
        { view: "installation", installationId, projectId: "site" },
        { days: 30 },
      );
      expect(customer.items).toHaveLength(0);
      await expect(
        dashboard.read(
          { view: "installation", installationId, projectId: "site" },
          { days: 30, purpose: "evaluation" },
        ),
      ).rejects.toThrow("USAGE_SCOPE_FORBIDDEN");
    });
    it("compares equal scoped periods and measures retries, latency and cache over all attempts", async () => {
      const installationId = randomUUID();
      await pricing.publish({
        actorId: "owner",
        price: usagePriceFixture({
          installationId,
          basis: "customer",
          method: "customer_tariff",
        }),
      });
      const create = async (
        daysAgo: number,
        taskId: string,
        input: number | null,
        output: number | null,
        duration: number | null,
        failed = false,
        purpose: "customer_runtime" | "development" = "customer_runtime",
      ) => {
        const start = usageAttemptFixture({ installationId, taskId, purpose });
        start.startedAt = new Date(
          Date.now() - daysAgo * 86400000,
        ).toISOString();
        if (input === null) start.requestedModel = "unpriced-model";
        const attempt = await ledger.begin(start);
        await ledger.observe(
          usageObservationFixture(attempt.attemptId, {
            model: input === null ? "unpriced-model" : "test-model",
            durationMs: duration,
            outcome: failed ? "failed" : "completed",
            coverage: input === null ? "partial" : "turn",
            tokens: {
              inputTokens: input,
              cachedInputTokens: input === null ? null : input / 5,
              outputTokens: output,
              reasoningOutputTokens: null,
              totalTokens:
                input === null || output === null ? null : input + output,
            },
          }),
        );
      };
      await create(8, "previous", 100, 50, 1000);
      await create(2, "retry-task", 1000, 200, 1000);
      await create(1, "retry-task", 400, 100, 3000, true);
      await create(1, "unpriced", null, null, null);
      await create(1, "owner-only", 5000, 1000, 9000, false, "development");
      await measureUsageOperation(
        { pool },
        usageAttemptFixture({ installationId, source: "build" }).context,
        async () => true,
        (value) => value,
      );
      const scope = {
        view: "installation" as const,
        installationId,
        projectId: "site",
      };
      const data = await dashboard.read(scope, { days: 7 });
      expect(data.summary.attempts).toBe(4);
      expect(data.analytics.current).toMatchObject({
        modelAttempts: 3,
        completed: 2,
        failed: 1,
        retries: 1,
        inputTokens: "1400",
        outputTokens: "300",
        unknownTokenAttempts: 1,
        cacheInputTokens: "1400",
        cachedInputTokens: "280",
        cacheMeasuredAttempts: 2,
        timedAttempts: 2,
        p50DurationMs: 2000,
        p95DurationMs: 2900,
      });
      expect(data.analytics.previous).toMatchObject({
        attempts: 1,
        modelAttempts: 1,
        inputTokens: "100",
        outputTokens: "50",
      });
      expect(
        Date.parse(data.from) - Date.parse(data.analytics.previous.from),
      ).toBe(7 * 86400000);
      expect(data.analytics.previous.to).toBe(data.from);
      expect(data.analytics.retryAmounts).toMatchObject([
        { basis: "customer", amountNanos: "1120000" },
      ]);
      expect(data.analytics.unsuccessfulAmounts).toMatchObject([
        { basis: "customer", amountNanos: "1120000" },
      ]);
      expect(
        data.byModel.find((row) => row.key === usageGroupKeys.noModel),
      ).toMatchObject({
        modelAttempts: 0,
        unknownTokenAttempts: 0,
      });
      const filtered = await dashboard.read(scope, {
        days: 7,
        model: "test-model",
        before: "1",
      });
      expect(filtered.analytics.current.modelAttempts).toBe(2);
      expect(filtered.analytics.previous.modelAttempts).toBe(1);
      expect(JSON.stringify(data.analytics)).not.toContain("provider");
      expect(JSON.stringify(data.analytics)).not.toContain("owner-only");
    });
    it("requires a real priced evaluation reservation for API admission", async () => {
      const installationId = randomUUID();
      await prepare(installationId);
      const admission = new EvaluationAdmissionRepository({ pool });
      expect(await admission.hasHardBudget(installationId, "site")).toBe(false);
      const before = await ledger.begin(
        usageAttemptFixture({ installationId, purpose: "customer_runtime" }),
      );
      await expect(admission.requireReservation(before)).rejects.toThrow(
        "EVAL_PRICED_RESERVATION_REQUIRED",
      );
      await budgets.update({
        eventId: randomUUID(),
        actorId: "owner",
        expectedRevision: 0,
        policy: {
          schemaVersion: "1.0",
          installationId,
          projectId: "site",
          purpose: "evaluation",
          basis: "provider",
          currency: "USD",
          revision: 1,
          mode: "hard",
          limitNanos: "1000000000",
          reservationNanos: "1000000000",
        },
      });
      expect(await admission.hasHardBudget(installationId, "site")).toBe(true);
      const attempt = await ledger.begin(
        usageAttemptFixture({
          installationId,
          purpose: "evaluation",
          source: "evaluation",
        }),
      );
      await expect(
        admission.requireReservation(attempt),
      ).resolves.toBeUndefined();
    });
    it("measures infrastructure separately without charging a model budget or inventing tokens", async () => {
      const installationId = randomUUID();
      await prepare(installationId);
      await pricing.publish({
        actorId: "owner",
        price: usagePriceFixture({
          installationId,
          basis: "infrastructure",
          provider: "platform",
          authMode: "internal",
          model: "build",
          unit: "second",
          method: "infrastructure_allocation",
          rates: {
            inputNanos: null,
            cachedInputNanos: null,
            outputNanos: null,
            secondNanos: "1000000000",
          },
        }),
      });
      const context = usageAttemptFixture({
        installationId,
        source: "build",
      }).context;
      const result = await measureUsageOperation(
        { pool },
        context,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 15));
          return "passed";
        },
        (value) => value === "passed",
      );
      expect(result).toBe("passed");
      const row = (
        await pool.query(
          "SELECT record FROM realize_ai_usage_attempts WHERE installation_id=$1",
          [installationId],
        )
      ).rows[0].record;
      expect(row.tokens.inputTokens).toBe(0);
      expect(row.model).toBeNull();
      expect(BigInt(row.costs.infrastructure.amountNanos)).toBeGreaterThan(
        BigInt(0),
      );
      await expect(
        ledger.begin(usageAttemptFixture({ installationId })),
      ).resolves.toBeDefined();
    });
    it("computes success cost from verified task evidence, all retries and exact purpose", async () => {
      const installationId = randomUUID();
      vi.stubEnv("REALIZE_INSTALLATION_ID", installationId);
      vi.stubEnv("REALIZE_PROJECT_ID", "site");
      try {
        await pricing.publish({
          actorId: "owner",
          price: usagePriceFixture({
            installationId,
            basis: "customer",
            method: "customer_tariff",
          }),
        });
        for (const [index, purpose] of (
          ["customer_runtime", "customer_runtime", "development"] as const
        ).entries()) {
          const attempt = await ledger.begin(
            usageAttemptFixture({
              installationId,
              taskId: "change:42",
              purpose,
            }),
          );
          expect(attempt.context.attemptNumber).toBe([1, 2, 1][index]);
          await ledger.observe(usageObservationFixture(attempt.attemptId));
        }
        const client = await pool.connect();
        try {
          await recordVerifiedPreviewUsage(
            client,
            randomUUID(),
            42,
            "c".repeat(64),
          );
        } finally {
          client.release();
        }
        const scope = {
          view: "installation" as const,
          installationId,
          projectId: "site",
        };
        const view = await dashboard.read(scope, { days: 30 });
        expect(view.verifiedTasks.successfulTasks).toBe(1);
        expect(view.verifiedTasks.amounts).toEqual([
          {
            basis: "customer",
            currency: "USD",
            pricedTasks: 1,
            amountNanos: "760000",
            averageNanos: "760000",
          },
        ]);
        expect(view.verifiedTasks.unknownByBasis).toEqual({ customer: 0 });
      } finally {
        vi.unstubAllEnvs();
      }
    });
    it("hides owner purposes/prices/costs and pages without expanding customer scope", async () => {
      const installationId = randomUUID();
      const customerPrice = usagePriceFixture({
        installationId,
        basis: "customer",
        method: "customer_tariff",
        currency: "EUR",
      });
      await pricing.publish({ actorId: "owner", price: customerPrice });
      for (let index = 0; index < 28; index++) {
        const context = {
          installationId,
          purpose:
            index === 27
              ? ("development" as const)
              : ("customer_runtime" as const),
          taskId: `task-${index}`,
          workflowKey: "content",
          agentProfileKey: "editor",
        };
        const attempt = await ledger.begin(usageAttemptFixture(context));
        await ledger.observe(usageObservationFixture(attempt.attemptId));
      }
      const scope = {
        view: "installation" as const,
        installationId,
        projectId: "site",
      };
      const first = await dashboard.read(scope, { days: 30 });
      expect(first.summary.attempts).toBe(27);
      expect(first.items.length).toBe(25);
      expect(first.amounts).toMatchObject([
        {
          basis: "customer",
          currency: "EUR",
          amountNanos: String(27 * 380000),
        },
      ]);
      const second = await dashboard.read(scope, {
        days: 30,
        before: first.nextCursor!,
      });
      expect(second.items.length).toBe(2);
      expect(second.summary.attempts).toBe(27);
      expect(second.byAgent).toEqual(first.byAgent);
      expect(second.bySource).toEqual(first.bySource);
      expect(second.byPurpose).toEqual(first.byPurpose);
      expect(second.filterOptions).toEqual(first.filterOptions);
      expect(
        second.items.every(
          (item) =>
            !first.items.some((old) => old.attemptId === item.attemptId),
        ),
      ).toBe(true);
      const json = JSON.stringify(first);
      for (const privateField of [
        "providerCost",
        "infrastructureCost",
        "sourceRef",
        '"prices"',
        "authMode",
        '"purpose":"development"',
      ])
        expect(json).not.toContain(privateField);
      await expect(
        dashboard.read(scope, { days: 30, projectId: "foreign" }),
      ).rejects.toThrow("USAGE_SCOPE_FORBIDDEN");
    });
    it("filters every cost group without losing admin agents, missing values or account isolation", async () => {
      const installationId = randomUUID();
      await pricing.publish({
        actorId: "owner",
        price: usagePriceFixture({
          installationId,
          basis: "customer",
          method: "customer_tariff",
        }),
      });
      const add = async (
        context: Partial<UsageContext>,
        model: string | null = "test-model",
        platform = false,
      ) => {
        const input = usageAttemptFixture({
          installationId,
          agentProfileKey: "editor",
          workflowKey: "content",
          ...context,
        });
        if (platform) input.provider = "platform";
        input.requestedModel = model;
        const attempt = await ledger.begin(input);
        await ledger.observe(
          usageObservationFixture(attempt.attemptId, {
            model,
            ...(model === null
              ? {
                  coverage: "partial" as const,
                  tokens: {
                    inputTokens: null,
                    cachedInputTokens: null,
                    outputTokens: null,
                    reasoningOutputTokens: null,
                    totalTokens: null,
                  },
                }
              : {}),
          }),
        );
      };
      for (const source of ["chat", "workflow", "execution", "review"] as const)
        await add({ source });
      for (const source of ["build", "preview"] as const)
        await add({ source }, null, true);
      await add({ agentProfileKey: null, workflowKey: null }, null);
      await add({ agentProfileKey: "default", workflowKey: "none" }, "unknown");
      await add(
        { agentProfileKey: "assistant", workflowKey: null },
        "no-model",
      );
      await add({
        purpose: "development",
        agentProfileKey: "owner-development",
      });
      await add({ purpose: "evaluation", agentProfileKey: "owner-evaluation" });
      await add({
        projectId: "foreign-project",
        agentProfileKey: "foreign-project-agent",
      });
      await add({
        installationId: randomUUID(),
        agentProfileKey: "foreign-installation-agent",
      });
      const scope = {
        view: "installation" as const,
        installationId,
        projectId: "site",
      };
      const view = await dashboard.read(scope, { days: 30 });
      expect(view.summary.attempts).toBe(9);
      expect(view.filterOptions.agents).toEqual([
        usageGroupKeys.unassigned,
        "assistant",
        "default",
        "editor",
      ]);
      expect(view.byPurpose.map((row) => row.key)).toEqual([
        "customer_runtime",
      ]);
      expect(view.byModel.map((row) => row.key)).toEqual(
        expect.arrayContaining([
          usageGroupKeys.unassigned,
          usageGroupKeys.noModel,
          "unknown",
          "no-model",
        ]),
      );
      for (const [dimension, filter] of [
        ["byAgent", "agentProfileKey"],
        ["byWorkflow", "workflowKey"],
        ["byModel", "model"],
        ["bySource", "source"],
        ["byPurpose", "purpose"],
      ] as const) {
        expect(
          view[dimension].reduce((sum, row) => sum + row.attempts, 0),
        ).toBe(view.summary.attempts);
        expect(
          view[dimension]
            .reduce(
              (sum, row) => sum + BigInt(row.inputTokens ?? "0"),
              BigInt(0),
            )
            .toString(),
        ).toBe(view.summary.inputTokens);
        expect(
          view[dimension]
            .flatMap((row) => row.amounts)
            .reduce(
              (sum, amount) => sum + BigInt(amount.amountNanos),
              BigInt(0),
            )
            .toString(),
        ).toBe(view.amounts[0].amountNanos);
        for (const group of view[dimension]) {
          const filtered = await dashboard.read(scope, {
            days: 30,
            [filter]: group.key,
          });
          expect(filtered.summary.attempts).toBe(group.attempts);
          expect(filtered.summary.inputTokens).toBe(group.inputTokens);
          expect(filtered.amounts).toEqual(group.amounts);
          expect(filtered.filterOptions).toEqual(view.filterOptions);
        }
      }
      const editor = await dashboard.read(scope, {
        days: 30,
        agentProfileKey: "editor",
      });
      expect(editor.summary.attempts).toBe(6);
      expect(editor.bySource.map((row) => row.key)).toEqual([
        "build",
        "chat",
        "execution",
        "preview",
        "review",
        "workflow",
      ]);
      expect(
        (
          await dashboard.read(scope, {
            days: 30,
            agentProfileKey: "editor",
            source: "workflow",
          })
        ).summary.attempts,
      ).toBe(1);
      expect(
        (await dashboard.read(scope, { days: 30, agentProfileKey: "default" }))
          .items[0].model,
      ).toBe("unknown");
      const owner = await dashboard.read(
        { view: "platform" },
        { days: 30, installationId, projectId: "site" },
      );
      expect(owner.summary.attempts).toBe(11);
      expect(owner.byPurpose.map((row) => row.key)).toEqual([
        "customer_runtime",
        "development",
        "evaluation",
      ]);
      const development = await dashboard.read(
        { view: "platform" },
        { days: 30, installationId, projectId: "site", purpose: "development" },
      );
      expect(development.summary.attempts).toBe(1);
      expect(development.filterOptions.agents).toEqual(["owner-development"]);
    });
  },
);
