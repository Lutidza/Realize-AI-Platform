/**
 * @file packages/payload-task-manager/src/server/audit-review/dossier-view/TaskAuditDossierView.types.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Определяет поля трёх связанных материалов, доступных оркестратору в карточке задачи.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import type { AuditArtifactRef } from "../AuditPublication.types";
import type { AuditDecision } from "../conclusions/ReviewAcceptance.types";
import type {
  ReviewAssessment,
  ReviewBody,
  ReviewResolution,
} from "../conclusions/ReviewConclusion.types";

export type TaskAuditDossierView = {
  taskId: string;
  taskKey: string;
  taskTitle: string;
  report: AuditArtifactRef & {
    resultId: string;
    resultRevision: number;
    auditorId: string;
    text: string;
  };
  conclusion: {
    conclusionId: string;
    revision: number;
    sha256: string;
    reviewerId: string;
    recommendation: ReviewBody["recommendation"];
    summary: string;
    assessments: Pick<
      ReviewAssessment,
      | "criterion"
      | "status"
      | "reason"
      | "reportQuote"
      | "correction"
      | "acceptanceTest"
    >[];
    resolutions: ReviewResolution[];
  };
  decision: Pick<
    AuditDecision,
    | "decisionId"
    | "actorId"
    | "action"
    | "reason"
    | "points"
    | "createdAt"
    | "conclusionId"
    | "conclusionRevision"
    | "conclusionSha256"
  >;
};
