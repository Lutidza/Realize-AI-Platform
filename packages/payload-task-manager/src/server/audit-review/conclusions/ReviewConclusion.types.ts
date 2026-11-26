/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/ReviewConclusion.types.ts
 * @version 1.1.2
 * @date 2026-11-26
 * @description Определяет происхождение заключения, основания приёмки и доказательства независимого ревью.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import type { REVIEW_CRITERIA } from "./reviewCriteria.constants";
import type { PoolClient } from "pg";
import type { ReviewDelivery } from "../AuditPublication.types";

export type ReviewAttempt = {
  reviewAttemptId: string;
  jobId: string;
  actorId: string;
  delivery: ReviewDelivery;
};

/** Runtime сверяет текущий доступ, исходную работу и участника в транзакции операции. */
export type ReviewAttemptAuthority = (
  client: PoolClient,
  reviewAttemptId: string,
  actorId: string,
) => Promise<ReviewAttempt>;

export type ReviewBasis = {
  executionId: string;
  resultId: string;
  resultRevision: number;
  reviewAssignmentId: string;
  reviewIteration: number;
  revision: number;
  criteriaSha256: string;
  policySha256: string;
  orchestratorId: string;
};

export type ReviewCriterionId = (typeof REVIEW_CRITERIA)[number];

export type ReviewEvidenceRef = {
  receiptId: string;
  path: string;
  sha256: string;
  startLine: number;
  endLine: number;
  auditorCoverage: "covered" | "partial" | "unread";
};

export type ReviewAssessment = {
  criterion: ReviewCriterionId;
  status: "confirmed" | "discrepancy";
  reason: string;
  reportQuote: string;
  evidence: ReviewEvidenceRef[];
  correction?: string;
  acceptanceTest?: string;
};

/** Связывает результат проверки исходного поручения с оценкой того же критерия и её новыми квитанциями. */
export type ReviewResolution = {
  criterion: ReviewCriterionId;
  acceptanceTest: string;
  outcome: "resolved" | "still_open";
  explanation: string;
};

export type ReviewBody = {
  schemaVersion: 1;
  recommendation: "confirmed" | "needs_changes";
  summary: string;
  assessments: ReviewAssessment[];
  resolutions?: ReviewResolution[];
};

export type PublishedConclusion = {
  conclusionId: string;
  revision: number;
  reviewAttemptId: string;
  jobId: string;
  reviewerId: string;
  delivery: ReviewDelivery;
  basis: ReviewBasis;
  body: ReviewBody;
  sha256: string;
};

/** В хеш входят канонические байты содержания, включая закреплённое происхождение и основание ревью. */
export type ReviewConclusionContent = Omit<
  PublishedConclusion,
  "conclusionId" | "sha256"
>;
export type ReviewConclusionRow = {
  result_id: string;
  manifest: string;
  content_sha256: string;
};
