/**
 * @file packages/change-engine/src/evaluation/compareEvaluationReports.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Сравнивает одинаковые корпуса и среды с явным перечнем изменяемых параметров кандидата.
 */
import {
  evaluationEnvelopeSchema,
  type EvaluationReport,
} from "@realize/ai-contracts/evaluation";
import { hashCanonicalJSON } from "../canonicalJson";
import { assessEvaluationReport } from "./assessEvaluationReport.service";

export function compareEvaluationReports(
  left: unknown,
  right: unknown,
  changes: ReadonlyArray<keyof EvaluationReport["candidate"]>,
) {
  const a = evaluationEnvelopeSchema.parse(left),
    b = evaluationEnvelopeSchema.parse(right);
  if (a.contentHash === b.contentHash)
    throw new Error("EVAL_DISTINCT_RUNS_REQUIRED");
  if (
    hashCanonicalJSON([
      a.report.suite,
      a.report.environment,
      a.report.budget,
    ]) !==
    hashCanonicalJSON([b.report.suite, b.report.environment, b.report.budget])
  )
    throw new Error("EVAL_COMPARISON_INPUT_MISMATCH");
  if (
    changes.includes("harnessHash") ||
    changes.includes("developmentSourceHash")
  )
    throw new Error("EVAL_COMPARISON_UNSUPPORTED_AXIS");
  for (const key of Object.keys(a.report.candidate) as Array<
    keyof EvaluationReport["candidate"]
  >)
    if (
      !changes.includes(key) &&
      a.report.candidate[key] !== b.report.candidate[key]
    )
      throw new Error(`EVAL_UNDECLARED_CHANGE:${key}`);
  const baseline = assessEvaluationReport(a),
    candidate = assessEvaluationReport(b);
  if (a.report.cases.length !== 6 || b.report.cases.length !== 6)
    throw new Error("EVAL_COMPARISON_INCOMPLETE");
  return {
    baseline,
    candidate,
    changes: [...changes],
    passedCasesDelta: candidate.passedCases - baseline.passedCases,
    elapsedMsDelta: b.report.elapsedMs - a.report.elapsedMs,
    providerCostDeltaNanos:
      baseline.providerCostNanos !== null &&
      candidate.providerCostNanos !== null &&
      baseline.currency === candidate.currency
        ? (
            BigInt(candidate.providerCostNanos) -
            BigInt(baseline.providerCostNanos)
          ).toString()
        : null,
  };
}
