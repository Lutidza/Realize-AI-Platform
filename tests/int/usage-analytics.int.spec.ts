/**
 * @file tests/int/usage-analytics.int.spec.ts
 * @version 1.1.0
 * @date 2026-10-06
 * @description Проверяет денежную точность, пропуски графика и честность рекомендаций из разрешённого DTO.
 */
import { describe, expect, it } from "vitest";
import type { UsageAmountDto, UsageGroupDto } from "@realize/ai-contracts";
import {
  usageGroupKeys,
  usageQuerySchema,
  usageContextSchema,
} from "@realize/ai-contracts";
import {
  summarizeUsageCost,
  deriveUsageInsights,
} from "../../packages/payload-ai-plugin/src/admin/usage/deriveUsageAnalytics.service";
import { buildUsageTrend } from "../../packages/payload-ai-plugin/src/admin/usage/buildUsageTrend.service";
import {
  observedUsageTokens,
  usageChange,
  usagePercent,
  formatUsageAmount,
  usageGroupLabel,
} from "../../packages/payload-ai-plugin/src/admin/usage/usageAnalyticsPresentation.util";
import {
  usageAnalyticsFixture,
  usageMetricsFixture,
} from "./fixtures/usageAnalytics.fixture";

const selection = { basis: "customer" as const, currency: "USD" };
const amount = (amountNanos: string, currency = "USD"): UsageAmountDto => ({
  basis: "customer",
  currency,
  amountNanos,
  estimated: 1,
  reconciled: 0,
});
const group = (key: string, amounts: UsageAmountDto[] = []): UsageGroupDto => ({
  key,
  attempts: 1,
  modelAttempts: 1,
  failed: 0,
  partial: 0,
  inputTokens: "100",
  outputTokens: "50",
  unknownTokenAttempts: 0,
  amounts,
});

describe("usage analytics presentation", () => {
  it("separates absent dimensions from literal IDs and rejects reserved keys in ledger context", () => {
    for (const [key, group] of [
      ["default", "byAgent"],
      ["none", "byWorkflow"],
      ["unknown", "byModel"],
      ["no-model", "byModel"],
    ] as const)
      expect(usageGroupLabel(key, group)).toBe(key);
    expect(usageGroupLabel(usageGroupKeys.unassigned, "byAgent")).toBe(
      "Без профиля агента",
    );
    expect(usageGroupLabel(usageGroupKeys.noModel, "byModel")).toBe(
      "Без вызова модели",
    );
    expect(usageGroupLabel("customer_runtime", "byPurpose")).toBe(
      "Работа установки",
    );
    expect(
      usageQuerySchema.safeParse({
        model: usageGroupKeys.noModel,
        agentProfileKey: usageGroupKeys.unassigned,
      }).success,
    ).toBe(true);
    expect(
      usageQuerySchema.safeParse({ agentProfileKey: usageGroupKeys.noModel })
        .success,
    ).toBe(false);
    expect(
      usageContextSchema.shape.agentProfileKey.safeParse(
        usageGroupKeys.unassigned,
      ).success,
    ).toBe(false);
  });
  it("keeps missing prices unknown and distinguishes an actual zero", () => {
    expect(summarizeUsageCost([], 1, 1, selection)).toMatchObject({
      state: "unknown",
      amountNanos: null,
      unknown: 1,
    });
    expect(summarizeUsageCost([amount("0")], 1, 1, selection)).toMatchObject({
      state: "complete",
      amountNanos: "0",
      unknown: 0,
    });
    expect(summarizeUsageCost([], 0, 0, selection)).toMatchObject({
      state: "empty",
      amountNanos: "0",
    });
  });
  it("sums nanos above Number safety without mixing currencies or provider costs", () => {
    const rows = [
      amount("9007199254740993123"),
      amount("9007199254740993123"),
      amount("7000000000", "EUR"),
      { ...amount("9900000000"), basis: "provider" as const },
    ];
    expect(summarizeUsageCost(rows, 4, 4, selection)).toMatchObject({
      amountNanos: "18014398509481986246",
      priced: 3,
      unknown: 1,
      state: "partial",
    });
    expect(
      summarizeUsageCost(rows, 4, 4, { ...selection, currency: "EUR" })
        .amountNanos,
    ).toBe("7000000000");
  });
  it("excludes platform checks from model price coverage", () => {
    expect(summarizeUsageCost([amount("100")], 4, 1, selection)).toMatchObject({
      applicable: 1,
      unknown: 0,
    });
    expect(
      summarizeUsageCost([], 4, 1, {
        basis: "infrastructure",
        currency: "USD",
      }),
    ).toMatchObject({ applicable: 4, unknown: 4 });
  });
  it("does not double-count cache or invent a growth baseline", () => {
    expect(observedUsageTokens("100", "50")).toBe("150");
    expect(observedUsageTokens(null, null)).toBeNull();
    expect(observedUsageTokens(null, "50")).toBe("50");
    expect(usageChange("0", "100")).toBe("-100%");
    expect(usageChange("100", "0")).toBeNull();
    expect(usagePercent(null, "100")).toBeNull();
    expect(usagePercent("25", "100")).toBe(25);
    expect(formatUsageAmount("1", "USD")).toBe("< 0,01 USD");
  });
  it("breaks the money line at unpriced days and preserves full exact values", () => {
    const data = usageAnalyticsFixture({
      byDay: [
        group("2026-10-03", [amount("9007199254740993123")]),
        group("2026-10-04"),
        group("2026-10-05", [amount("8000000000")]),
      ],
    });
    const graph = buildUsageTrend(data, "cost", selection, 390);
    expect(graph.points.map((point) => point.value)).toEqual([
      "9007199254740993123",
      null,
      "8000000000",
    ]);
    expect(graph.paths).toHaveLength(2);
    expect(graph.points[1].partial).toBe(true);
    expect(graph.points[1].y).toBeNull();
    expect(
      graph.points
        .filter((point) => point.y !== null)
        .every((point) => Number.isFinite(point.y)),
    ).toBe(true);
  });
  it("renders days without calls as zero and incomplete token observations as partial", () => {
    const data = usageAnalyticsFixture({
      byDay: [
        { ...group("2026-10-04"), inputTokens: null, unknownTokenAttempts: 1 },
      ],
    });
    const graph = buildUsageTrend(data, "tokens", selection);
    expect(graph.points.map((point) => point.value)).toEqual(["0", "50", "0"]);
    expect(graph.points[1].partial).toBe(true);
  });
  it("routes a customer to permitted actions without suggesting owner price mutation", () => {
    const data = usageAnalyticsFixture();
    data.analytics.current = usageMetricsFixture({
      modelAttempts: 2,
      failed: 1,
      retries: 1,
    });
    data.summary.attempts = 2;
    data.analytics.retryAmounts = [
      amount("12000000000"),
      amount("99000000000", "EUR"),
      { ...amount("77000000000"), basis: "provider" },
    ];
    const insights = deriveUsageInsights(data, selection);
    expect(insights.find((item) => item.id === "pricing")?.tab).toBe(
      "operations",
    );
    expect(insights.find((item) => item.id === "failures")?.filters).toEqual({
      outcome: "failed",
    });
    expect(insights.find((item) => item.id === "retries")?.detail).toContain(
      "не является гарантированной экономией",
    );
    expect(insights.find((item) => item.id === "retries")?.detail).toContain(
      "12,00 USD",
    );
    expect(insights.some((item) => item.tab === "pricing")).toBe(false);
  });
});
