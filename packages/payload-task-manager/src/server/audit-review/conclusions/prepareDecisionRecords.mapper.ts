/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/prepareDecisionRecords.mapper.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Связывает решение по заключению и ожидаемую версию доработки с исходным назначением.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
import { randomUUID } from "node:crypto";
import type { AuditDecision, AuditRework } from "./ReviewAcceptance.types";
import type { PublishedConclusion } from "./ReviewConclusion.types";
import type { validateReviewDecision } from "./validateReviewDecision.validator";
import type { acceptanceActors } from "./reviewAcceptanceBasis.repository";

export function prepareDecisionRecords(
  conclusion: PublishedConclusion,
  command: ReturnType<typeof validateReviewDecision>,
  actorId: string,
  actors: Awaited<ReturnType<typeof acceptanceActors>>,
) {
  const { action, reason, points } = command,
    { conclusionId, delivery, basis } = conclusion,
    { task } = delivery;
  const decisionId = randomUUID();
  const workId = action === "accept_audit" ? null : randomUUID();
  const decision: AuditDecision = {
    decisionId,
    conclusionId,
    conclusionRevision: conclusion.revision,
    conclusionSha256: conclusion.sha256,
    action,
    reason,
    points,
    actorId,
    taskId: task.taskId,
    taskRevisionAtDecision: actors.taskRevision,
    basis,
    workId,
    createdAt: new Date().toISOString(),
  };
  if (action === "accept_audit" || !workId) return { decision, work: null };
  const audit = action === "return_audit";
  const work: AuditRework = {
    workId,
    decisionId,
    conclusionId,
    taskId: task.taskId,
    resultId: delivery.resultId,
    assigneeId: audit ? actors.auditorId : actors.reviewerId,
    assignmentId: audit ? task.taskAssignmentId : delivery.target.assignmentId,
    assignmentRevision: audit
      ? task.assignmentRevision
      : delivery.target.assignmentRevision,
    nextIteration: delivery.target.iteration + 1,
    expectedRevision:
      (audit ? delivery.resultRevision : conclusion.revision) + 1,
    action,
    points,
  };
  return { decision, work };
}
