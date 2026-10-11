/**
 * @file tests/int/evaluation-quality.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет release gate, обязательные отказы, provenance и честность неполной стоимости evals.
 */
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { evaluationEnvelopeSchema } from "@realize/ai-contracts/evaluation";
import { hashCanonicalJSON } from "@realize/change-engine";
import {
  assessEvaluationReport,
  compareEvaluationReports,
} from "@realize/change-engine/evaluation";
import {
  evaluationFixture,
  evaluationReviewFixture,
} from "./fixtures/evaluation.fixture";

describe("evaluation mandatory gates", () => {
  it("requires qualitative review and preserves unknown money", () => {
    const evidence = evaluationFixture();
    const result = assessEvaluationReport(evidence);
    expect(result).toMatchObject({
      status: "review_required",
      passedCases: 6,
      totalTokens: 720,
      providerCostNanos: null,
      costPerSuccessfulCaseNanos: null,
    });
    expect(
      assessEvaluationReport(evidence, evaluationReviewFixture(evidence))
        .status,
    ).toBe("passed");
  });
  it.each([".ai/guard.md", "AGENTS.md", "new-outside-scope.txt"])(
    "cannot waive a protected/out-of-scope change: %s",
    (path) => {
      const evidence = evaluationFixture();
      evidence.report.cases[1].after[path] = "f".repeat(64);
      evidence.contentHash = hashCanonicalJSON(evidence.report);
      expect(
        assessEvaluationReport(evidence, evaluationReviewFixture(evidence)),
      ).toMatchObject({ status: "blocked", passedCases: 5 });
    },
  );
  it("does not accept a model's success claim without the file change", () => {
    const evidence = evaluationFixture();
    evidence.report.cases[0].after = { ...evidence.report.cases[0].before };
    evidence.contentHash = hashCanonicalJSON(evidence.report);
    expect(assessEvaluationReport(evidence).violations).toContainEqual({
      scenarioId: "scoped-edit",
      repeat: 0,
      code: "filesystem_contract",
    });
  });
  it("requires failed-then-successful source evidence, not only a correct answer", () => {
    const evidence = evaluationFixture();
    evidence.report.cases[2].sourceCalls = [];
    evidence.contentHash = hashCanonicalJSON(evidence.report);
    expect(assessEvaluationReport(evidence).status).toBe("blocked");
  });
  it("rejects modified evidence, wrong corpus and stale review hash", () => {
    const evidence = evaluationFixture();
    const review = evaluationReviewFixture(evidence);
    evidence.report.elapsedMs++;
    expect(() => assessEvaluationReport(evidence)).toThrow("HASH_MISMATCH");
    evidence.contentHash = hashCanonicalJSON(evidence.report);
    expect(() => assessEvaluationReport(evidence, review)).toThrow(
      "REVIEW_BINDING",
    );
    evidence.report.suite = {
      ...evidence.report.suite,
      corpusHash: "0".repeat(64),
    };
    evidence.contentHash = hashCanonicalJSON(evidence.report);
    expect(() => assessEvaluationReport(evidence)).toThrow("CORPUS");
  });
  it("does not pass interrupted, empty, duplicated or skipped coverage", () => {
    const evidence = evaluationFixture();
    evidence.report.cases = [];
    evidence.report.termination = "budget";
    evidence.contentHash = hashCanonicalJSON(evidence.report);
    expect(assessEvaluationReport(evidence).status).toBe("incomplete");
    const duplicate = evaluationFixture();
    duplicate.report.cases[5] = duplicate.report.cases[2];
    duplicate.contentHash = hashCanonicalJSON(duplicate.report);
    expect(assessEvaluationReport(duplicate).status).toBe("blocked");
  });
  it("blocks incomplete provider measurements or silent model substitution", () => {
    const evidence = evaluationFixture();
    evidence.report.cases[0].usage!.model = "different-model";
    evidence.report.cases[1].usage!.coverage = "partial";
    evidence.contentHash = hashCanonicalJSON(evidence.report);
    expect(
      assessEvaluationReport(evidence).violations.filter(
        (x) => x.code === "usage_incomplete",
      ),
    ).toHaveLength(2);
  });
  it("computes exact nanos only with complete same-currency costs and reviewed successes", () => {
    const evidence = evaluationFixture();
    for (const item of evidence.report.cases)
      item.usage!.costs.provider = {
        state: "estimated",
        amountNanos: "9007199254740993",
        currency: "USD",
        pricingId: "fixture-price",
        evidenceRef: null,
      };
    evidence.contentHash = hashCanonicalJSON(evidence.report);
    expect(assessEvaluationReport(evidence).providerCostNanos).toBe(
      "54043195528445958",
    );
    const review = evaluationReviewFixture(evidence);
    review.cases[0].honest = false;
    expect(assessEvaluationReport(evidence, review)).toMatchObject({
      status: "blocked",
      passedCases: 5,
      costPerSuccessfulCaseNanos: "10808639105689192",
    });
    evidence.report.cases[0].usage!.costs.provider.currency = "EUR";
    evidence.contentHash = hashCanonicalJSON(evidence.report);
    expect(assessEvaluationReport(evidence).providerCostNanos).toBeNull();
  });
  it("validates strict bounded DTOs", () => {
    const evidence = evaluationFixture();
    expect(
      evaluationEnvelopeSchema.safeParse({ ...evidence, secret: "unexpected" })
        .success,
    ).toBe(false);
    evidence.report.cases[0].output = "x".repeat(32769);
    expect(evaluationEnvelopeSchema.safeParse(evidence).success).toBe(false);
  });
  it("compares repeat coverage only for declared candidate changes in the same environment", () => {
    const left = evaluationFixture(),
      right = evaluationFixture();
    right.report.candidate.model = "candidate-model";
    for (const item of right.report.cases)
      item.usage!.model = "candidate-model";
    right.contentHash = hashCanonicalJSON(right.report);
    expect(() => compareEvaluationReports(left, right, [])).toThrow(
      "UNDECLARED_CHANGE",
    );
    expect(compareEvaluationReports(left, right, ["model"])).toMatchObject({
      passedCasesDelta: 0,
      providerCostDeltaNanos: null,
    });
    right.report.environment.architecture = "arm64";
    right.contentHash = hashCanonicalJSON(right.report);
    expect(() => compareEvaluationReports(left, right, ["model"])).toThrow(
      "INPUT_MISMATCH",
    );
    expect(() => compareEvaluationReports(left, left, [])).toThrow("DISTINCT");
  });
});
