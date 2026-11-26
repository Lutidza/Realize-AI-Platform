/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/ReviewAcceptance.types.ts
 * @version 1.1.2
 * @date 2026-11-26
 * @description Описывает команду приёмки, адресованную доработку и квитанцию решения оркестратора.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import type { ReviewBasis, ReviewCriterionId } from "./ReviewConclusion.types";

export type AcceptanceSettings = Pick<
  ReviewBasis,
  "orchestratorId" | "criteriaSha256" | "policySha256"
>;
export type ReviewDecisionPoint = {
  criterion: ReviewCriterionId;
  correction: string;
  acceptanceTest: string;
};
export type ReviewDecisionCommand = {
  action: "accept_audit" | "return_audit" | "clarify_reviewer";
  reason: string;
  expectedConclusionSha256: string;
  expectedBasisRevision: number;
  points?: ReviewDecisionPoint[];
};
export type AuditDecision = {
  decisionId: string;
  conclusionId: string;
  conclusionRevision: number;
  conclusionSha256: string;
  action: ReviewDecisionCommand["action"];
  reason: string;
  points: ReviewDecisionPoint[];
  actorId: string;
  taskId: string;
  taskRevisionAtDecision: number;
  basis: ReviewBasis;
  workId: string | null;
  createdAt: string;
};
export type AuditRework = {
  workId: string;
  decisionId: string;
  conclusionId: string;
  taskId: string;
  resultId: string;
  assigneeId: string;
  assignmentId: string;
  assignmentRevision: number;
  nextIteration: number;
  expectedRevision: number;
  action: "return_audit" | "clarify_reviewer";
  points: ReviewDecisionPoint[];
};
