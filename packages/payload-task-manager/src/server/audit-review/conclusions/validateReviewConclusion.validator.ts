/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/validateReviewConclusion.validator.ts
 * @version 1.1.2
 * @date 2026-11-26
 * @description Сверяет четыре оценки ревьюера, цитаты отчёта и собственные квитанции с закреплёнными материалами.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { REVIEW_CRITERIA } from "./reviewCriteria.constants";
import { z } from "zod";
import {
  assertPublishedDelivery,
  readAuditArtifact,
} from "../AuditDossier.repository";
import type { ReviewDelivery } from "../AuditPublication.types";
import {
  type ReviewBody,
  type ReviewEvidenceRef,
} from "./ReviewConclusion.types";
import { readAuditorCoverage } from "./readAuditorCoverage.service";
import { reviewReworkContext } from "../rework/readReworkContext.repository";
import { validateReviewResolutions } from "./validateReviewResolutions.validator";

const text = z.string().refine((value) => value.trim().length > 0);
const line = z.number().int().positive();
const evidence = z.strictObject({
  receiptId: z.uuid(),
  path: text,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  startLine: line,
  endLine: line,
  auditorCoverage: z.enum(["covered", "partial", "unread"]),
});
const bodySchema = z.strictObject({
  schemaVersion: z.literal(1),
  recommendation: z.enum(["confirmed", "needs_changes"]),
  summary: text,
  assessments: z
    .array(
      z.strictObject({
        criterion: z.enum(REVIEW_CRITERIA),
        status: z.enum(["confirmed", "discrepancy"]),
        reason: text,
        reportQuote: text,
        evidence: z.array(evidence).min(1),
        correction: text.optional(),
        acceptanceTest: text.optional(),
      }),
    )
    .length(REVIEW_CRITERIA.length),
  resolutions: z
    .array(
      z.strictObject({
        criterion: z.enum(REVIEW_CRITERIA),
        acceptanceTest: text,
        outcome: z.enum(["resolved", "still_open"]),
        explanation: text,
      }),
    )
    .max(REVIEW_CRITERIA.length)
    .optional(),
});

/** Публикация передаёт свою транзакцию после подтверждения участника и текущей ревизии оснований. */
export async function validateReviewConclusion(
  client: PoolClient,
  actorId: string,
  reviewAttemptId: string,
  delivery: ReviewDelivery,
  raw: unknown,
): Promise<ReviewBody> {
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) throw new Error("review_conclusion_invalid");
  const body = parsed.data;
  const criteria = new Set(body.assessments.map((row) => row.criterion));
  if (
    criteria.size !== REVIEW_CRITERIA.length ||
    (body.recommendation === "needs_changes") !==
      body.assessments.some((row) => row.status === "discrepancy")
  )
    throw new Error("review_conclusion_invalid");
  await assertPublishedDelivery(client, delivery);
  const rework = await reviewReworkContext(client, delivery);
  if (rework?.parent.reviewAttemptId === reviewAttemptId)
    throw new Error("review_rework_mismatch");
  validateReviewResolutions(body, rework);
  const reportBytes = await readAuditArtifact(
    client,
    delivery.resultId,
    "report",
    actorId,
  );
  if (
    createHash("sha256").update(reportBytes).digest("hex") !==
    delivery.report.sha256
  )
    throw new Error("review_anchor_mismatch");
  const report = reportBytes.toString("utf8");
  const coverageFor = await readAuditorCoverage(client, delivery, actorId);
  const ids = new Set(
    body.assessments.flatMap((row) => row.evidence.map((ref) => ref.receiptId)),
  );
  const receipts = await client.query<
    Omit<ReviewEvidenceRef, "auditorCoverage">
  >(
    `SELECT r.receipt_id AS "receiptId",r.path,r.sha AS sha256,r.start_line AS "startLine",r.end_line AS "endLine"
     FROM audit_review_evidence.reads r JOIN audit_dossier.sources s ON (s.result_id,s.path,s.sha)=(r.result_id,r.path,r.sha)
     WHERE r.result_id=$1 AND r.review_attempt_id=$2 AND r.actor_id=$3 AND r.receipt_id=ANY($4::uuid[])`,
    [delivery.resultId, reviewAttemptId, actorId, [...ids]],
  );
  if (receipts.rows.length !== ids.size)
    throw new Error("review_evidence_mismatch");
  const trusted = new Map(receipts.rows.map((row) => [row.receiptId, row]));
  for (const row of body.assessments) {
    if (!report.includes(row.reportQuote))
      throw new Error("review_anchor_mismatch");
    if (
      row.status === "discrepancy"
        ? !row.correction || !row.acceptanceTest
        : row.correction !== undefined || row.acceptanceTest !== undefined
    )
      throw new Error("review_conclusion_invalid");
    if (
      new Set(row.evidence.map((ref) => ref.receiptId)).size !==
      row.evidence.length
    )
      throw new Error("review_evidence_mismatch");
    for (const ref of row.evidence) {
      const receipt = trusted.get(ref.receiptId);
      if (
        !receipt ||
        receipt.path !== ref.path ||
        receipt.sha256 !== ref.sha256 ||
        receipt.startLine !== ref.startLine ||
        receipt.endLine !== ref.endLine ||
        coverageFor(receipt) !== ref.auditorCoverage
      )
        throw new Error("review_evidence_mismatch");
      if (row.status === "confirmed" && ref.auditorCoverage !== "covered")
        throw new Error("review_evidence_mismatch");
    }
    row.evidence.sort((a, b) => a.receiptId.localeCompare(b.receiptId));
  }
  // Порядок представления критериев и квитанций не меняет содержание повторной отправки.
  body.assessments.sort(
    (a, b) =>
      REVIEW_CRITERIA.indexOf(a.criterion) -
      REVIEW_CRITERIA.indexOf(b.criterion),
  );
  return body;
}
