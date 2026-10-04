/**
 * @file tests/int/search-quality.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Проверяет независимую правильность целей, совместимость сравнений и честные дневные агрегаты.
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  searchQualityRunSchema,
  type SearchQualityRun,
} from "@realize/ai-contracts";
import { mapSearchQualityHistory } from "../../packages/payload-ai-plugin/src/search-observability/mapSearchQualityHistory.mapper";
import {
  retainSearchAggregateHistory,
  mapSearchAggregateHistory,
} from "../../packages/payload-ai-plugin/src/search-observability/retainSearchAggregateHistory.service";
import { searchObservationControlStateSchema } from "../../packages/payload-ai-plugin/src/search-observability/searchObservationState.schemas";
import { SEARCH_OBSERVATION_INITIAL_STATE } from "../../packages/payload-ai-plugin/src/search-observability/searchObservation.config";
import { searchObservationFixture } from "./searchObservation.fixture";
const before: SearchQualityRun = {
  schemaVersion: "1.0",
  id: randomUUID(),
  observedAt: "2026-09-29T12:00:00.000Z",
  corpus: "repository-navigation",
  corpusVersion: "a".repeat(64),
  sourceVersion: "b".repeat(64),
  release: "before",
  consumer: "cli",
  mode: "literal-baseline",
  cache: "initial",
  repeat: 0,
  targets: 10,
  correctTargets: 6,
  taskDurationMs: 200,
  calls: 20,
  filesRead: 10,
  bytesRead: 1000,
  outputBytes: 100,
};
const after = (extra: Partial<SearchQualityRun> = {}): SearchQualityRun => ({
  ...before,
  id: randomUUID(),
  observedAt: "2026-09-30T12:00:00.000Z",
  release: "after",
  sourceVersion: "c".repeat(64),
  mode: "navigation",
  correctTargets: 8,
  taskDurationMs: 100,
  calls: 10,
  bytesRead: 250,
  ...extra,
});
describe("Known-target search quality", () => {
  it("считает правильность целей отдельно от сокращения времени, вызовов и чтения", () => {
    const data = mapSearchQualityHistory([before, after()]);
    expect(data.comparisons[0].accuracyChangePoints).toBeCloseTo(20);
    expect(data.comparisons[0]).toMatchObject({
      taskTimeReductionPercent: 50,
      callReductionPercent: 50,
      readReductionPercent: 75,
    });
  });
  it.each([
    { corpusVersion: "d".repeat(64) },
    { consumer: "mcp" as const },
    { cache: "repeat" as const, repeat: 1 },
    { targets: 11 },
  ])("не сравнивает другой корпус/consumer/прогон %j", (extra) => {
    expect(mapSearchQualityHistory([before, after(extra)]).comparisons).toEqual(
      [],
    );
  });
  it("не выдумывает неизвестное чтение и не делит на нулевой baseline", () => {
    const data = mapSearchQualityHistory([
      { ...before, taskDurationMs: 0, calls: 0, bytesRead: null },
      after(),
    ]);
    expect(data.comparisons[0]).toMatchObject({
      taskTimeReductionPercent: null,
      callReductionPercent: null,
      readReductionPercent: null,
    });
  });
  it.each([
    { correctTargets: 11 },
    { cache: "repeat", repeat: 0 },
    { query: "private" },
    { sourceVersion: "version" },
  ])("отклоняет некорректные или приватные summaries %j", (extra) => {
    expect(
      searchQualityRunSchema.safeParse({ ...before, ...extra }).success,
    ).toBe(false);
  });
  it("сохраняет measured zero, не выдаёт p95 после raw retention и исключает старше 180 дней", () => {
    const state = searchObservationControlStateSchema.parse(
      SEARCH_OBSERVATION_INITIAL_STATE,
    );
    const now = Date.parse("2026-09-30T13:00:00.000Z");
    retainSearchAggregateHistory(
      state,
      [
        searchObservationFixture({
          observedAt: new Date(now - 181 * 86400000).toISOString(),
        }),
        searchObservationFixture({
          observedAt: new Date(now - 1000).toISOString(),
          bytesRead: 0,
          durationMs: 10,
        }),
        searchObservationFixture({
          observedAt: new Date(now).toISOString(),
          bytesRead: null,
          durationMs: 30,
          outcome: "partial",
        }),
      ],
      now,
    );
    const history = mapSearchAggregateHistory(state);
    expect(history.series).toHaveLength(1);
    expect(history.series[0].metrics).toMatchObject({
      count: 2,
      complete: 1,
      partial: 1,
      averageMs: 20,
      averageBytesRead: 0,
      measuredReads: 1,
      p95Ms: null,
      completePercent: 50,
    });
  });
});
