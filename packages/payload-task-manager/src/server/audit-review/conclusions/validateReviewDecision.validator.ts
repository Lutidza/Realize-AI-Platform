/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/validateReviewDecision.validator.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Проверяет адресат и критерии решения относительно зафиксированного заключения ревьюера.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import { REVIEW_CRITERIA } from "./reviewCriteria.constants";
import { z } from "zod";
import { isDeepStrictEqual as equal } from "node:util";
import { type PublishedConclusion } from "./ReviewConclusion.types";
import type {
  AuditDecision,
  ReviewDecisionCommand,
} from "./ReviewAcceptance.types";

const statement = z.string().trim().min(1).max(8000);
const commandSchema = z.strictObject({
  action: z.enum(["accept_audit", "return_audit", "clarify_reviewer"]),
  reason: statement,
  expectedConclusionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  expectedBasisRevision: z.number().int().positive(),
  points: z
    .array(
      z.strictObject({
        criterion: z.enum(REVIEW_CRITERIA),
        correction: statement,
        acceptanceTest: statement,
      }),
    )
    .max(REVIEW_CRITERIA.length)
    .default([]),
});

/** Возврат аудитору требует установленного расхождения. Вопрос об обосновании возвращается автору заключения. */
export function validateReviewDecision(
  input: ReviewDecisionCommand,
  conclusion: PublishedConclusion,
  existing?: AuditDecision,
) {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) throw new Error("review_decision_invalid");
  const command = parsed.data;
  if (
    command.expectedConclusionSha256 !== conclusion.sha256 ||
    command.expectedBasisRevision !== conclusion.basis.revision
  )
    throw new Error("review_basis_stale");
  const { points, action } = command;
  if (
    existing &&
    (existing.action !== action ||
      existing.reason !== command.reason ||
      !equal(existing.points, points))
  )
    throw new Error("review_decision_conflict");
  if (action === "accept_audit") {
    if (
      points.length ||
      conclusion.body.recommendation !== "confirmed" ||
      conclusion.body.assessments.some((item) => item.status !== "confirmed")
    )
      throw new Error("review_decision_invalid");
  } else {
    if (
      !points.length ||
      new Set(points.map((point) => point.criterion)).size !== points.length
    )
      throw new Error("review_decision_invalid");
    for (const point of points) {
      const item = conclusion.body.assessments.find(
        (item) => item.criterion === point.criterion,
      );
      if (!item || (action === "return_audit" && item.status !== "discrepancy"))
        throw new Error("review_decision_invalid");
    }
  }
  return command;
}
