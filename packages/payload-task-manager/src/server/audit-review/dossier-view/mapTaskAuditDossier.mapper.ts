/**
 * @file packages/payload-task-manager/src/server/audit-review/dossier-view/mapTaskAuditDossier.mapper.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Отбирает текст и реквизиты материалов досье для отображения адресату решения.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import type { PublishedConclusion } from "../conclusions/ReviewConclusion.types";
import type { AuditDecision } from "../conclusions/ReviewAcceptance.types";
import type { TaskAuditDossierView } from "./TaskAuditDossierView.types";

/** Внешний DTO не получает содержимое источников, внутренние квитанции и конфигурацию доступа. */
export function mapTaskAuditDossier(
  taskKey: string,
  taskTitle: string,
  material: { auditorId: string; text: string },
  review: PublishedConclusion,
  decision: AuditDecision,
): TaskAuditDossierView {
  const { task, report, resultId, resultRevision } = review.delivery;
  const { body } = review;
  return {
    taskId: task.taskId,
    taskKey,
    taskTitle,
    report: {
      resultId,
      resultRevision,
      artifactId: report.artifactId,
      revision: report.revision,
      sha256: report.sha256,
      auditorId: material.auditorId,
      text: material.text,
    },
    conclusion: {
      conclusionId: review.conclusionId,
      revision: review.revision,
      sha256: review.sha256,
      reviewerId: review.reviewerId,
      recommendation: body.recommendation,
      summary: body.summary,
      assessments: body.assessments.map(
        ({
          criterion,
          status,
          reason,
          reportQuote,
          correction,
          acceptanceTest,
        }) => ({
          criterion,
          status,
          reason,
          reportQuote,
          correction,
          acceptanceTest,
        }),
      ),
      resolutions: (body.resolutions ?? []).map(
        ({ criterion, acceptanceTest, outcome, explanation }) => ({
          criterion,
          acceptanceTest,
          outcome,
          explanation,
        }),
      ),
    },
    decision: {
      decisionId: decision.decisionId,
      actorId: decision.actorId,
      action: decision.action,
      reason: decision.reason,
      createdAt: decision.createdAt,
      conclusionId: decision.conclusionId,
      conclusionRevision: decision.conclusionRevision,
      conclusionSha256: decision.conclusionSha256,
      points: decision.points.map(
        ({ criterion, correction, acceptanceTest }) => ({
          criterion,
          correction,
          acceptanceTest,
        }),
      ),
    },
  };
}
