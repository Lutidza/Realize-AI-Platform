/**
 * @file packages/ai-contracts/src/evaluation/Evaluation.types.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Задаёт общий порт качества для owner tooling и будущих Model Garden/Router.
 */
import type { z } from "zod";
import type {
  evaluationCaseSchema,
  evaluationReportSchema,
  evaluationReviewSchema,
  evaluationEnvelopeSchema,
} from "./evaluation.schemas";
export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
export type EvaluationReport = z.infer<typeof evaluationReportSchema>;
export type EvaluationReview = z.infer<typeof evaluationReviewSchema>;
export type EvaluationEnvelope = z.infer<typeof evaluationEnvelopeSchema>;
export type EvaluationAssessment = {
  status: "passed" | "blocked" | "incomplete" | "review_required";
  violations: Array<{ scenarioId: string; repeat: number; code: string }>;
  passedCases: number;
  expectedCases: 6;
  totalTokens: number | null;
  observedTokens: string;
  unknownTokenCases: number;
  providerCostNanos: string | null;
  currency: string | null;
  costPerSuccessfulCaseNanos: string | null;
};
