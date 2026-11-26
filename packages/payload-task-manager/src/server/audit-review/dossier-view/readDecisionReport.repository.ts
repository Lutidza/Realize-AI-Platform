/**
 * @file packages/payload-task-manager/src/server/audit-review/dossier-view/readDecisionReport.repository.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Сверяет исходный результат, точную версию отчёта и происхождение повторного ревью в снимке досье.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import type { PoolClient } from "pg";
import {
  assertPublishedDelivery,
  loadAuditResult,
} from "../AuditDossier.repository";
import type { PublishedConclusion } from "../conclusions/ReviewConclusion.types";
import { reviewReworkContext } from "../rework/readReworkContext.repository";
import { readAuditRevisionLink } from "../rework/auditRevisionLinks.repository";

/** Вызывает владелец уже авторизованного решения; SELECT-view ограничивает все запросы байтами отчётов. */
export async function readDecisionReport(
  client: PoolClient,
  conclusion: PublishedConclusion,
) {
  const { delivery } = conclusion;
  const { resultId, resultRevision, report } = delivery;
  await assertPublishedDelivery(client, delivery);
  const audit = await loadAuditResult(client, resultId);
  if (
    audit.resultId !== resultId ||
    audit.resultRevision !== resultRevision ||
    !equal(audit.task, delivery.task) ||
    !equal(audit.report, report) ||
    !equal(audit.coverage, delivery.coverage) ||
    report.revision !== resultRevision ||
    conclusion.revision !== (delivery.rework?.conclusionRevision ?? 1)
  ) {
    throw new Error("audit_dossier_inconsistent");
  }
  const rework = await reviewReworkContext(client, delivery);
  if (rework) {
    const { parent, work } = rework;
    const edge = await client.query(
      "SELECT 1 FROM audit_conclusions.successors WHERE work_id=$1 AND parent_id=$2 AND conclusion_id=$3",
      [work.workId, parent.conclusionId, conclusion.conclusionId],
    );
    if (!edge.rowCount) throw new Error("audit_dossier_inconsistent");
    if (work.action === "return_audit") {
      const link = await readAuditRevisionLink(client, resultId);
      if (
        link?.workId !== work.workId ||
        link.parentResultId !== parent.delivery.resultId ||
        link.parentRevision !== parent.delivery.resultRevision ||
        link.parentConclusionSha256 !== parent.sha256 ||
        link.parentConclusionRevision !== parent.revision ||
        link.conclusionId !== parent.conclusionId ||
        link.iteration !== work.nextIteration ||
        link.decisionId !== work.decisionId
      )
        throw new Error("audit_dossier_inconsistent");
    }
  }
  const { task, target } = delivery;
  const row = await client.query<{ bytes: Buffer; auditor_id: string }>(
    `SELECT m.bytes,a.actor_id AS auditor_id FROM audit_dossier.preview_report_materials m
     JOIN audit_review.assignments a ON a.execution_id=$5 AND a.plan_revision=$6 AND a.role='auditor'
       AND a.stage_id=$7 AND a.assignment_id=$8 AND a.assignment_revision=$9
     JOIN audit_review.assignments r ON r.execution_id=a.execution_id AND r.plan_revision=a.plan_revision AND r.role='reviewer'
       AND r.stage_id=$10 AND r.assignment_id=$11 AND r.assignment_revision=$12 AND r.actor_id=$13 AND r.actor_id<>a.actor_id
     WHERE m.result_id=$1 AND m.artifact_id=$2 AND m.revision=$3 AND m.sha=$4`,
    [
      resultId,
      report.artifactId,
      report.revision,
      report.sha256,
      task.executionId,
      task.planRevision,
      task.stageId,
      task.taskAssignmentId,
      task.assignmentRevision,
      target.stageId,
      target.assignmentId,
      target.assignmentRevision,
      conclusion.reviewerId,
    ],
  );
  const material = row.rows[0];
  const bytes = material?.bytes;
  if (
    !bytes ||
    createHash("sha256").update(bytes).digest("hex") !== report.sha256
  )
    throw new Error("audit_dossier_inconsistent");
  return {
    auditorId: material.auditor_id,
    text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    ),
  };
}
