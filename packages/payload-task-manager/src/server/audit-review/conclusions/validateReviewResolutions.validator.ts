/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/validateReviewResolutions.validator.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Сверяет ответы новой оценки с конкретными пунктами решения и их условиями повторной проверки.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import type { AuditRework } from "./ReviewAcceptance.types";
import type { PublishedConclusion, ReviewBody } from "./ReviewConclusion.types";
import { REVIEW_CRITERIA } from "./reviewCriteria.constants";

/** Критерий однозначно связывает пункт с оценкой, её точной цитатой и квитанциями текущей попытки. */
export function validateReviewResolutions(
  body: ReviewBody,
  context: { work: AuditRework; parent: PublishedConclusion } | null,
) {
  const { resolutions } = body;
  if (!context) {
    if (resolutions !== undefined)
      throw new Error("review_resolution_mismatch");
    return;
  }
  const { work, parent } = context;
  const { points } = work;
  if (
    !resolutions ||
    resolutions.length !== points.length ||
    new Set(resolutions.map((row) => row.criterion)).size !== points.length
  )
    throw new Error("review_resolution_mismatch");
  for (const point of points) {
    const resolution = resolutions.find(
      (row) => row.criterion === point.criterion,
    );
    const assessment = body.assessments.find(
      (row) => row.criterion === point.criterion,
    );
    if (
      !resolution ||
      resolution.acceptanceTest !== point.acceptanceTest ||
      !assessment ||
      (resolution.outcome === "still_open") !==
        (assessment.status === "discrepancy")
    )
      throw new Error("review_resolution_mismatch");
    if (work.action === "clarify_reviewer") {
      const previous = parent.body.assessments.find(
        (row) => row.criterion === point.criterion,
      );
      const lastAnswer = parent.body.resolutions?.find(
        (row) => row.criterion === point.criterion,
      );
      // Новая квитанция сопровождается уточнённым обоснованием в оценке или в ответе на вопрос.
      const unchangedText = [
        previous?.reason,
        lastAnswer?.explanation,
        point.correction,
        point.acceptanceTest,
      ].some((source) => source?.trim() === resolution.explanation.trim());
      if (
        !previous ||
        (assessment.reason.trim() === previous.reason.trim() && unchangedText)
      )
        throw new Error("review_resolution_mismatch");
    }
  }
  resolutions.sort(
    (a, b) =>
      REVIEW_CRITERIA.indexOf(a.criterion) -
      REVIEW_CRITERIA.indexOf(b.criterion),
  );
}
