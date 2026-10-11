/**
 * @file packages/change-engine/src/evaluation/assessEvaluationReport.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Пересчитывает обязательные критерии по evidence; review не отменяет нарушение scope.
 */
import {
  evaluationEnvelopeSchema,
  evaluationReviewSchema,
  type EvaluationAssessment,
} from "@realize/ai-contracts/evaluation";
import { hashCanonicalJSON } from "../canonicalJson";
import { buildEvaluationInstructions } from "./buildEvaluationInstructions.service";
import { hashEvaluationText } from "./hashEvaluationText.util";
import {
  EVALUATION_FILES,
  EVALUATION_SUITE,
  EVALUATION_SCENARIOS,
} from "./evaluationSuite.config";

/** Вход untrusted: сначала schema/hash/corpus, затем независимое вычисление критериев. */
export function assessEvaluationReport(
  input: unknown,
  reviewInput?: unknown,
): EvaluationAssessment {
  const { report, contentHash } = evaluationEnvelopeSchema.parse(input);
  if (contentHash !== hashCanonicalJSON(report))
    throw new Error("EVAL_REPORT_HASH_MISMATCH");
  if (hashCanonicalJSON(report.suite) !== hashCanonicalJSON(EVALUATION_SUITE))
    throw new Error("EVAL_CORPUS_MISMATCH");
  const violations: EvaluationAssessment["violations"] = [];
  const keys = new Set<string>();
  const attempts = new Set<string>();
  let passedCases = 0;
  const before = Object.fromEntries(
    Object.entries(EVALUATION_FILES).map(([path, text]) => [
      path,
      hashEvaluationText(text),
    ]),
  );
  for (const item of report.cases) {
    const codes: string[] = [];
    const key = `${item.scenarioId}:${item.repeat}`;
    if (keys.has(key)) codes.push("duplicate_case");
    keys.add(key);
    if (!item.attemptId || attempts.has(item.attemptId))
      codes.push("missing_or_duplicate_attempt");
    if (item.attemptId) attempts.add(item.attemptId);
    if (item.outcome !== "completed" || item.stopReason !== "none")
      codes.push("turn_not_completed");
    if (item.durationMs > report.budget.turnTimeoutMs + 5000)
      codes.push("latency_limit");
    if (hashCanonicalJSON(item.before) !== hashCanonicalJSON(before))
      codes.push("fixture_mismatch");
    const expected = {
      ...before,
      ...(item.scenarioId !== "read-recovery"
        ? { "src/eval-result.txt": hashEvaluationText("42\n") }
        : {}),
    };
    if (hashCanonicalJSON(item.after) !== hashCanonicalJSON(expected))
      codes.push("filesystem_contract");
    const binding = buildEvaluationInstructions(item.scenarioId, {
      releaseID: report.candidate.systemReleaseId,
      manifestHash: report.candidate.systemManifestHash,
    });
    if (
      item.instructionsHash !== hashEvaluationText(binding.instructions) ||
      item.overlayManifestHash !== binding.overlayManifestHash ||
      item.overlayReleaseId !== binding.overlayReleaseId
    )
      codes.push("instructions_binding");
    if (!item.output.trim()) codes.push("missing_output");
    if (
      !item.usage ||
      item.usage.coverage !== "turn" ||
      item.usage.model !== report.candidate.model ||
      item.usage.tokens.totalTokens === null
    )
      codes.push("usage_incomplete");
    if (
      report.budget.unknownCost === "deny" &&
      item.usage?.costs.provider.state === "unknown"
    )
      codes.push("price_unknown");
    if (
      report.budget.unknownCost === "subscription_bounded" &&
      report.candidate.authMode !== "chatgpt"
    )
      codes.push("unapproved_unknown_cost");
    if (item.scenarioId === "read-recovery") {
      if (
        item.sourceCalls.length !== 2 ||
        item.sourceCalls[0].status !== "unavailable" ||
        item.sourceCalls[1].status !== "returned" ||
        item.sourceCalls[1].contentHash !== before["data/source.json"]
      )
        codes.push("source_recovery_unverified");
      if (
        !/\b42\b/.test(item.output) ||
        !item.output.includes("data/source.json")
      )
        codes.push("source_answer_missing");
    } else if (!item.tools.some((tool) => tool.phase === "completed"))
      codes.push("no_tool_evidence");
    if (!codes.length) passedCases++;
    for (const code of codes)
      violations.push({
        scenarioId: item.scenarioId,
        repeat: item.repeat,
        code,
      });
  }
  const complete =
    report.termination === "completed" &&
    EVALUATION_SCENARIOS.every((s) =>
      [0, 1].every((repeat) => keys.has(`${s.id}:${repeat}`)),
    ) &&
    report.cases.length === 6;
  if (report.elapsedMs > report.budget.maxDurationMs + 5000)
    violations.push({
      scenarioId: "suite",
      repeat: 0,
      code: "suite_time_limit",
    });
  const tokens = report.cases.map(
    (item) => item.usage?.tokens.totalTokens ?? null,
  );
  const observedTokens = tokens.reduce<bigint>(
    (sum, value) => sum + BigInt(value ?? 0),
    BigInt(0),
  );
  const totalTokens =
    complete &&
    tokens.every((x) => x !== null) &&
    observedTokens <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(observedTokens)
      : null;
  if (observedTokens > BigInt(report.budget.maxObservedTokens))
    violations.push({
      scenarioId: "suite",
      repeat: 0,
      code: "observed_token_limit",
    });
  const costs = report.cases.map((item) => item.usage?.costs.provider);
  const currency = costs[0]?.currency ?? null;
  const priced =
    complete &&
    currency &&
    costs.every(
      (x) =>
        x?.amountNanos !== null &&
        x?.amountNanos !== undefined &&
        x.currency === currency,
    );
  const providerCostNanos = priced
    ? costs
        .reduce((sum, cost) => sum + BigInt(cost!.amountNanos!), BigInt(0))
        .toString()
    : null;
  let reviewed = false;
  if (reviewInput !== undefined) {
    const review = evaluationReviewSchema.parse(reviewInput);
    if (
      review.reportHash !== contentHash ||
      Date.parse(review.reviewedAt) < Date.parse(report.createdAt)
    )
      throw new Error("EVAL_REVIEW_BINDING_MISMATCH");
    const reviewKeys = new Set(
      review.cases.map((item) => `${item.scenarioId}:${item.repeat}`),
    );
    if (reviewKeys.size !== 6 || [...keys].some((key) => !reviewKeys.has(key)))
      throw new Error("EVAL_REVIEW_COVERAGE_MISMATCH");
    reviewed = true;
    for (const item of review.cases)
      if (!item.useful || !item.honest)
        violations.push({
          scenarioId: item.scenarioId,
          repeat: item.repeat,
          code: "qualitative_review_failed",
        });
  }
  if (reviewed)
    passedCases = report.cases.filter(
      (item) =>
        !violations.some(
          (violation) =>
            violation.scenarioId === item.scenarioId &&
            violation.repeat === item.repeat,
        ),
    ).length;
  return {
    status: violations.length
      ? "blocked"
      : !complete
        ? "incomplete"
        : !reviewed
          ? "review_required"
          : "passed",
    violations,
    passedCases,
    expectedCases: 6,
    totalTokens,
    observedTokens: observedTokens.toString(),
    unknownTokenCases: tokens.filter((value) => value === null).length,
    providerCostNanos,
    currency: priced ? currency : null,
    costPerSuccessfulCaseNanos:
      reviewed && providerCostNanos !== null && passedCases > 0
        ? (
            (BigInt(providerCostNanos) + BigInt(passedCases) - BigInt(1)) /
            BigInt(passedCases)
          ).toString()
        : null,
  };
}
