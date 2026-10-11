/**
 * @file tests/int/fixtures/evaluation.fixture.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Создаёт синтетические DTO только для тестов валидатора, без заявления о реальном model evidence.
 */
import { randomUUID } from "node:crypto";
import type {
  EvaluationEnvelope,
  EvaluationReport,
  EvaluationReview,
} from "@realize/ai-contracts/evaluation";
import {
  SYSTEM_AI_RELEASE,
  hashCanonicalJSON,
  unknownUsageCost,
} from "@realize/change-engine";
import {
  EVALUATION_FILES,
  EVALUATION_SUITE,
  EVALUATION_BUDGET,
  EVALUATION_SCENARIOS,
  buildEvaluationInstructions,
  hashEvaluationText,
} from "@realize/change-engine/evaluation";

export function evaluationFixture(): EvaluationEnvelope {
  const before = Object.fromEntries(
    Object.entries(EVALUATION_FILES).map(([path, text]) => [
      path,
      hashEvaluationText(text),
    ]),
  );
  const report: EvaluationReport = {
    schemaVersion: "1.0",
    runId: randomUUID(),
    createdAt: "2026-10-05T00:00:00.000Z",
    suite: EVALUATION_SUITE,
    candidate: {
      systemReleaseId: SYSTEM_AI_RELEASE.releaseID,
      systemManifestHash: SYSTEM_AI_RELEASE.manifestHash,
      developmentSourceHash: "a".repeat(64),
      runtimeHash: "b".repeat(64),
      harnessHash: "c".repeat(64),
      adapterVersion: "fixture-1",
      model: "fixture-model",
      authMode: "chatgpt",
      platformReleaseId: null,
      modelCatalogRevision: null,
      routerPolicyVersion: null,
    },
    environment: {
      platform: "linux",
      architecture: "x64",
      nodeVersion: "v24.18.0",
      codexVersion: "fixture-only",
    },
    budget: { ...EVALUATION_BUDGET, unknownCost: "subscription_bounded" },
    elapsedMs: 6000,
    termination: "completed",
    cases: [0, 1].flatMap((repeat) =>
      EVALUATION_SCENARIOS.map((scenario) => {
        const binding = buildEvaluationInstructions(scenario.id);
        return {
          scenarioId: scenario.id,
          repeat,
          runId: randomUUID(),
          attemptId: randomUUID(),
          instructionsHash: hashEvaluationText(binding.instructions),
          overlayReleaseId: binding.overlayReleaseId,
          overlayManifestHash: binding.overlayManifestHash,
          startedAt: "2026-10-05T00:00:00.000Z",
          durationMs: 1000,
          outcome: "completed" as const,
          stopReason: "none" as const,
          before: { ...before },
          after: {
            ...before,
            ...(scenario.writable
              ? { "src/eval-result.txt": hashEvaluationText("42\n") }
              : {}),
          },
          sourceCalls: scenario.writable
            ? []
            : [
                { status: "unavailable" as const, contentHash: null },
                {
                  status: "returned" as const,
                  contentHash: before["data/source.json"],
                },
              ],
          tools: [
            { phase: "completed" as const, summary: "fixture-only operation" },
          ],
          output: scenario.writable
            ? "Записано 42 в разрешённый файл."
            : "Значение 42 из data/source.json получено после повторного чтения.",
          usage: {
            coverage: "turn" as const,
            tokens: {
              inputTokens: 100,
              cachedInputTokens: 0,
              outputTokens: 20,
              reasoningOutputTokens: 10,
              totalTokens: 120,
            },
            model: "fixture-model",
            costs: {
              provider: unknownUsageCost(),
              infrastructure: unknownUsageCost(),
              customer: unknownUsageCost(),
            },
          },
        };
      }),
    ),
  };
  return { report, contentHash: hashCanonicalJSON(report) };
}
export function evaluationReviewFixture(
  envelope: EvaluationEnvelope,
): EvaluationReview {
  return {
    schemaVersion: "1.0",
    reportHash: envelope.contentHash,
    reviewer: "fixture-reviewer",
    reviewedAt: "2026-10-05T00:01:00.000Z",
    cases: envelope.report.cases.map((item) => ({
      scenarioId: item.scenarioId,
      repeat: item.repeat,
      useful: true,
      honest: true,
      notes: "Синтетический review fixture для unit-проверки.",
    })),
  };
}
