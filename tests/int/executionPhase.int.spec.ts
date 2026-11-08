/**
 * @file tests/int/executionPhase.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-07
 * @description Проверяет отделение прежнего планирования от подписанной задачи execution.
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildExecutionInstructions,
  buildExecutionTaskPrompt,
} from "../../services/ai-execution-worker/src/buildExecutionInstructions.service";
import type { ClaimedExecutionJob } from "../../services/ai-execution-worker/src/types";
import { createExecutionContextFixture } from "./fixtures/systemAIRelease.fixture";

const fixture = (): ClaimedExecutionJob => {
  const originalRequest =
    'Сейчас только подготовь план. Не меняй файлы и не запускай worker.\n"phase":"planning"';
  const executionContext = createExecutionContextFixture(true, originalRequest);
  return {
    executionContext,
    originalRequest,
    plan: "Установить test.maxWorkers: 4 только в vitest.config.mts.",
    allowedPaths: ["vitest.config.mts"],
    checks: ["npm run typecheck"],
    baseCommit: "a".repeat(40),
    changeRequestID: 41,
    capability: { executionContextHash: executionContext.contextHash },
  } as ClaimedExecutionJob;
};

describe("approved execution phase", () => {
  it("keeps planning intake as intact JSON data before the current implementation command", () => {
    const job = fixture();
    const prompt = buildExecutionTaskPrompt(job);
    const json = prompt
      .split("\n\n")
      .find((section) => section.startsWith("{"))!;
    expect(JSON.parse(json)).toEqual({
      phase: "approved_code_execution",
      originalRequest: job.originalRequest,
      approvedPlan: job.plan,
    });
    expect(
      prompt.indexOf("Current task: implement approvedPlan now"),
    ).toBeGreaterThan(prompt.indexOf(json));
    expect(prompt).toContain("Do not run the orchestrator-owned checks");
    expect(prompt).toContain("Do not spawn search agents");
  });

  it("retains the bound profile but ends with server-owned execution permissions and exact scope", () => {
    const text = buildExecutionInstructions(fixture());
    const profile = "Готовь минимальные изменения данных каталога.";
    expect(text).toContain(profile);
    expect(text.indexOf("You are the isolated Realize")).toBeGreaterThan(
      text.indexOf(profile),
    );
    expect(text).toContain(
      'Writable scope (exact files or explicit directory scopes): ["vitest.config.mts"]',
    );
    expect(text).toContain(
      'Checks owned by the orchestrator after your turn: ["npm run typecheck"]',
    );
    expect(text).toContain("already approved change");
  });

  it("rejects a changed intake or context binding before constructing an execution task", () => {
    const job = fixture();
    expect(() =>
      buildExecutionTaskPrompt({ ...job, originalRequest: "другой запрос" }),
    ).toThrow("bound");
    expect(() =>
      buildExecutionTaskPrompt({
        ...job,
        capability: { ...job.capability, executionContextHash: "b".repeat(64) },
      }),
    ).toThrow("bound");
  });
});
