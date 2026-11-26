/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/readReworkContext.repository.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Сопоставляет поручение и решение с неизменяемой версией исходного заключения и предметом повторного ревью.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import { isDeepStrictEqual as equal } from "node:util";
import type { PoolClient } from "pg";
import type { ReviewDelivery } from "../AuditPublication.types";
import type {
  AuditDecision,
  AuditRework,
} from "../conclusions/ReviewAcceptance.types";
import { loadConclusion } from "../conclusions/readConclusionRevision.repository";

/** Вызывающая операция держит в той же транзакции полномочия получателя на материалы поручения. */
export async function readReworkContext(client: PoolClient, workId: string) {
  const result = await client.query<{
    work: AuditRework;
    decision: AuditDecision;
    decision_id: string;
    conclusion_id: string;
  }>(
    `SELECT w.record AS work,d.manifest AS decision,d.decision_id,d.conclusion_id
     FROM audit_acceptance.work w JOIN audit_acceptance.decisions d USING(decision_id)
     WHERE w.work_id=$1`,
    [workId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("review_rework_mismatch");
  const { work, decision } = row;
  const parent = await loadConclusion(client, row.conclusion_id);
  const { task, target } = parent.delivery;
  const auditor = work.action === "return_audit";
  if (
    work.workId !== workId ||
    decision.workId !== workId ||
    work.decisionId !== row.decision_id ||
    decision.decisionId !== row.decision_id ||
    work.conclusionId !== parent.conclusionId ||
    decision.conclusionId !== parent.conclusionId ||
    decision.conclusionRevision !== parent.revision ||
    decision.conclusionSha256 !== parent.sha256 ||
    !equal(decision.basis, parent.basis) ||
    decision.action !== work.action ||
    (!auditor && work.action !== "clarify_reviewer") ||
    work.taskId !== task.taskId ||
    decision.taskId !== task.taskId ||
    work.resultId !== parent.delivery.resultId ||
    work.nextIteration !== target.iteration + 1 ||
    work.assignmentId !==
      (auditor ? task.taskAssignmentId : target.assignmentId) ||
    work.assignmentRevision !==
      (auditor ? task.assignmentRevision : target.assignmentRevision) ||
    (!auditor && work.assigneeId !== parent.reviewerId) ||
    work.expectedRevision !==
      (auditor ? parent.delivery.resultRevision : parent.revision) + 1 ||
    !work.points.length ||
    !equal(work.points, decision.points)
  )
    throw new Error("review_rework_mismatch");
  return { work, parent, decision };
}

/** Проверяет итерацию уже зарегистрированной выдачи. Authority участника и источник envelope проверяет вызывающая операция. */
export async function reviewReworkContext(
  client: PoolClient,
  delivery: ReviewDelivery,
) {
  const lineage = delivery.rework;
  if (!lineage) return null;
  const context = await readReworkContext(client, lineage.workId);
  const { work, parent } = context;
  const old = parent.delivery;
  if (
    lineage.parentConclusionId !== parent.conclusionId ||
    lineage.parentConclusionSha256 !== parent.sha256 ||
    lineage.parentConclusionRevision !== parent.revision ||
    lineage.conclusionRevision !== parent.revision + 1 ||
    lineage.kind !== work.action ||
    !equal(delivery.task, old.task) ||
    !equal(delivery.target, { ...old.target, iteration: work.nextIteration })
  )
    throw new Error("review_rework_mismatch");
  if (work.action === "return_audit") {
    if (
      delivery.resultId === old.resultId ||
      delivery.resultRevision !== work.expectedRevision
    )
      throw new Error("review_rework_mismatch");
  } else if (
    delivery.resultId !== old.resultId ||
    delivery.resultRevision !== old.resultRevision ||
    !equal(delivery.report, old.report) ||
    !equal(delivery.coverage, old.coverage)
  ) {
    throw new Error("review_rework_mismatch");
  }
  return context;
}
