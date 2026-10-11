/**
 * @file tests/int/usage-ledger.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет деньги, billing provenance, серверные DTO и поведение metering при сбоях.
 */
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type {
  AgentEvent,
  UsageAttempt,
  UsageObservation,
  RunTurnInput,
} from "@realize/ai-contracts";
import {
  calculateUsageCost,
  parseUsagePrice,
  unknownUsageCost,
} from "@realize/change-engine";
import { usageTokensSchema } from "@realize/ai-contracts";
import { readCodexUsage } from "../../packages/codex-adapter/src/readCodexUsage.mapper";
import { MeteredAgentAdapter } from "../../packages/payload-ai-plugin/src/usage/MeteredAgent.adapter";
import { projectUsageObservation } from "../../packages/payload-ai-plugin/src/usage/projectUsageObservation.mapper";
import {
  usageAttemptDto,
  platformUsageAttemptDto,
} from "../../packages/payload-ai-plugin/src/usage/usageAttemptDto.mapper";
import { scopeUsageQuery } from "../../packages/payload-ai-plugin/src/usage/usageScope.validator";
import {
  usageAttemptFixture,
  usagePriceFixture,
  usageObservationFixture,
} from "./fixtures/usageLedger.fixture";
import {
  formatUsageMoney,
  parseUsageMoney,
} from "../../packages/payload-ai-plugin/src/admin/usage/usageMoney.util";

const initial = (): UsageAttempt => ({
  ...usageAttemptFixture(),
  model: "test-model",
  finishedAt: null,
  revision: 0,
  observationSequence: 0,
  outcome: "running",
  tokens: {
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    totalTokens: null,
  },
  durationMs: null,
  toolDurationMs: null,
  coverage: "unknown",
  prices: { provider: usagePriceFixture() },
  costs: {
    provider: unknownUsageCost(),
    customer: unknownUsageCost(),
    infrastructure: unknownUsageCost(),
  },
});
const turn: RunTurnInput = {
  cwd: "/fixture",
  runID: "run-1",
  developerInstructions: "fixture",
  prompt: "fixture",
};

describe("usage contracts and money", () => {
  it("counts cached input once and reasoning within output; rounds only after summing", () => {
    const usage = usageObservationFixture("a").tokens;
    expect(
      calculateUsageCost(usagePriceFixture(), usage, 1000).amountNanos,
    ).toBe("380000");
    expect(
      calculateUsageCost(
        usagePriceFixture({
          rates: {
            inputNanos: "1",
            cachedInputNanos: "1",
            outputNanos: "1",
            secondNanos: null,
          },
        }),
        usage,
        0,
      ).amountNanos,
    ).toBe("1");
    expect(
      calculateUsageCost(
        usagePriceFixture(),
        { ...usage, cachedInputTokens: null },
        1000,
      ).state,
    ).toBe("unknown");
    expect(calculateUsageCost(undefined, usage, 0).amountNanos).toBeNull();
    expect(
      usageTokensSchema.safeParse({ ...usage, cachedInputTokens: 101 }).success,
    ).toBe(false);
  });
  it("rejects tampering and subscription as API price", () => {
    expect(() => usagePriceFixture({ authMode: "chatgpt" })).toThrow(
      "USAGE_SUBSCRIPTION_REQUIRES_ALLOCATION",
    );
    expect(
      usagePriceFixture({
        authMode: "chatgpt",
        method: "subscription_allocation",
      }).method,
    ).toBe("subscription_allocation");
    const price = usagePriceFixture();
    expect(() => parseUsagePrice({ ...price, currency: "EUR" })).toThrow(
      "USAGE_PRICE_HASH_MISMATCH",
    );
  });
  it("keeps exact large decimals and absent provider fields", () => {
    const decimal = "123456789012.123456789";
    expect(formatUsageMoney(parseUsageMoney(decimal))).toBe(decimal);
    expect(parseUsageMoney("0,000000001")).toBe("1");
    expect(() => parseUsageMoney("1e5")).toThrow();
    expect(formatUsageMoney(null)).toBe("Не рассчитано");
    expect(readCodexUsage({ inputTokens: 0 })?.outputTokens).toBeNull();
    expect(readCodexUsage({ inputTokens: "10" })).toBeNull();
  });
  it("scopes customer queries and removes every private cost/provenance field", () => {
    expect(() =>
      scopeUsageQuery(
        { view: "installation", installationId: "local", projectId: "site" },
        { days: 30, purpose: "development" },
      ),
    ).toThrow("USAGE_SCOPE_FORBIDDEN");
    expect(() =>
      scopeUsageQuery(
        { view: "installation", installationId: "local", projectId: "site" },
        { days: 30, installationId: "another" },
      ),
    ).toThrow();
    const attempt = initial();
    const customer = JSON.stringify(usageAttemptDto(attempt));
    for (const field of [
      "providerCost",
      "prices",
      "authMode",
      "sourceRef",
      "systemReleaseId",
      "actorId",
      "installationId",
      "infrastructureCost",
      "pricingId",
    ])
      expect(customer).not.toContain(field);
    expect(platformUsageAttemptDto(attempt).priceReferences.provider).toBe(
      attempt.prices.provider?.pricingId,
    );
  });
});

describe("durable metering around provider", () => {
  const setup = (events: AgentEvent[], rejected = false, exceeded = false) => {
    let projection = initial();
    const observations: UsageObservation[] = [];
    const writer = {
      begin: vi.fn(async (value) => {
        if (rejected) throw new Error("USAGE_BUDGET_EXHAUSTED");
        projection = { ...projection, ...value };
        return projection;
      }),
      observe: vi.fn(async (value: UsageObservation) => {
        observations.push(value);
        projection = projectUsageObservation(projection, value);
        return {
          attempt: projection,
          replayed: false,
          budgetExceeded: exceeded,
        };
      }),
    };
    const provider = {
      cancelRun: vi.fn(async () => {}),
      runTurn: vi.fn(async function* () {
        for (const event of events) yield event;
      }),
    };
    const meter = new MeteredAgentAdapter(provider, writer, async () =>
      usageAttemptFixture(),
    );
    return { meter, writer, provider, observations };
  };
  const measurement: AgentEvent = {
    type: "usage.measured",
    measurement: {
      measurementId: "m1",
      model: "test-model",
      providerThreadId: "t1",
      providerTurnId: "v1",
      tokens: usageObservationFixture("a").tokens,
      coverage: "turn",
    },
  };
  it("denies provider before any call when admission fails", async () => {
    const test = setup([], true);
    await expect(async () => {
      for await (const _event of test.meter.runTurn(turn)) {
        /* drain */
      }
    }).rejects.toThrow("USAGE_BUDGET_EXHAUSTED");
    expect(test.provider.runTurn).not.toHaveBeenCalled();
  });
  it("persists cumulative usage and terminal event even without SSE; keeps measurements private", async () => {
    const test = setup([
      measurement,
      { type: "assistant.completed", content: "done" },
    ]);
    const delivered: AgentEvent[] = [];
    for await (const event of test.meter.runTurn(turn)) delivered.push(event);
    expect(delivered.map((event) => event.type)).toEqual([
      "assistant.completed",
    ]);
    expect(test.observations.map((event) => event.outcome)).toEqual([
      "running",
      "completed",
    ]);
    expect(test.observations[1].tokens).toEqual(test.observations[0].tokens);
  });
  it("records cancellation on early consumer close and preserves unknown counters", async () => {
    const test = setup([{ type: "run.started", threadID: "t1" }, measurement]);
    for await (const _event of test.meter.runTurn(turn)) break;
    expect(test.observations[0].outcome).toBe("cancelled");
    expect(test.observations[0].tokens.inputTokens).toBeNull();
  });
  it("interrupts provider and records failure after measured overrun", async () => {
    const test = setup([measurement], false, true);
    await expect(async () => {
      for await (const _event of test.meter.runTurn(turn)) {
        /* drain */
      }
    }).rejects.toThrow("USAGE_BUDGET_EXCEEDED_DURING_TURN");
    expect(test.provider.cancelRun).toHaveBeenCalledWith("run-1");
    expect(test.observations.at(-1)?.outcome).toBe("failed");
  });
});
